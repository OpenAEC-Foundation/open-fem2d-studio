// Het startmodel — drie losse constructies, drie materialen.
//
// WAAROM DEZE TEST BESTAAT
// Het model waarop de app opent is geen decor. Het is het model waarmee de
// multi-materiaalketen wordt uitgeprobeerd: staal (EN 1993), hout (EN 1995) en
// beton (EN 1992) moeten er alle drie op draaien. Gaat daar iets stil mis —
// een profielnaam die de ontleder niet leest, een korf die half is ingevuld,
// een oplegging die de ligger axiaal klemt — dan ziet niemand een foutmelding.
// De staaf wordt dan simpelweg overgeslagen en het toetsingspaneel blijft
// leeg. Precies dat soort stilte legt deze test vast.
//
// De numerieke verwachtingen komen niet uit een eerdere run maar uit de
// invoer zelf: de som van de opgelegde lasten (evenwicht) en de formule
// n = 3m + r − 3j − c (statische onbepaaldheid). Ze zouden dus ook kloppen als
// de solver morgen anders wordt geschreven.
//
// Checks:
//  (a) SAMENSTELLING — negen knopen, zes staven, drie delen die elkaar niet
//      raken; per staaf het materiaal dat de toetsing eruit afleidt.
//  (b) DOORSNEDEN    — "HEA160", "160x400" en "300x600" komen alle drie door
//      hun eigen ontleder; geen enkele valt terug op een default.
//  (c) OPLEGGINGEN   — het portaal neemt horizontale kracht op (twee
//      scharnieren), de twee rechte liggers juist NIET: één scharnier plus
//      rollen, dus geen axiale dwang.
//  (d) VALIDATIE     — beide modelcontroles (de strenge poort van de sidecar
//      en de controle in het canvas) aanvaarden het model inclusief
//      wapeningskorf, en klagen niet over de losse delen.
//  (e) EVENWICHT     — ΣF_z per belastinggeval is exact de opgelegde last.
//  (f) ONBEPAALDHEID — portaal 1×, houten ligger 1×, betonnen balk 0×
//      statisch onbepaald; het hele model dus 2×.
//  (g) TOETSBAARHEID — de drie bouwers pakken samen alle zes de staven op en
//      slaan er geen enkele over; de korf komt 1-op-1 door.
//  (h) OMSCHRIJVINGEN — elke last draagt een ingevulde omschrijving.
//
// Uitvoeren: npx tsx test-startmodel.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=startmodel

const { makeInitialSnapshot, DEFAULT_LOAD_CASES } = await import(
  "./src/hooks/useFemStore.ts"
);
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const { controleerModel } = await import("./src/lib/modelControle.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const { bepaalOnbepaaldheid } = await import("./src/lib/statischeOnbepaaldheid.ts");
const { materiaalVanStaaf } = await import("./src/lib/variantInvoer.ts");
const { resolveSection } = await import("./src/lib/sectionResolver.ts");
const { buildSteelCheckInputs } = await import("./src/lib/steelCheckBuilder.ts");
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");
const { buildBetonCheckInputs } = await import("./src/lib/betonCheckBuilder.ts");
const { korvenUitStaven } = await import("./src/stores/checkStore.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
function check(naam, actual, expected, tol = 0) {
  const gelijk = typeof expected === "number"
    ? Math.abs(actual - expected) <= tol
    : Object.is(actual, expected);
  if (gelijk) { passed++; log(`  ✓ ${naam}: ${JSON.stringify(actual)}`); }
  else        { failed++; log(`  ✗ ${naam}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); }
}

const s = makeInitialSnapshot();
const model = {
  nodes: s.nodes,
  beams: s.beams,
  supports: s.supports,
  plates: s.plates,
  loadCases: DEFAULT_LOAD_CASES,
  loads: s.loads,
  // Uit: het eigen gewicht zou de handgerekende lastsom van check (e)
  // vertroebelen zonder dat het iets over het startmodel bewijst.
  selfWeightEnabled: false,
  scheefstandEnabled: false,
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

// De drie delen, zoals ze in het model uit elkaar liggen. Alle verwachtingen
// hieronder zijn per deel opgeschreven; zou iemand een staaf verplaatsen dan
// valt dat hier op en niet pas in een unity check.
const DELEN = [
  { naam: "stalen portaal",  knopen: [1, 2, 3, 4], staven: [1, 2, 3], graad: 1 },
  { naam: "houten ligger",   knopen: [5, 6, 7],    staven: [4, 5],    graad: 1 },
  { naam: "betonnen balk",   knopen: [8, 9],       staven: [6],       graad: 0 },
];

// ─────────────────────────────────────────────────────────────────────────
log("\n[a] Samenstelling: drie losse constructies, drie materialen");
{
  check("aantal knopen", s.nodes.length, 9);
  check("aantal staven", s.beams.length, 6);
  check("aantal opleggingen", s.supports.length, 7);
  check("aantal lasten", s.loads.length, 7);

  for (const [id, verwacht] of [[1, "staal"], [2, "staal"], [3, "staal"],
                                [4, "hout"], [5, "hout"], [6, "beton"]]) {
    const b = s.beams.find((x) => x.id === id);
    check(`staaf ${id} → toetskern`, materiaalVanStaaf(b), verwacht);
  }

  // De delen mogen geen knoop delen: dat is wat "los van elkaar" betekent, en
  // het is de eigenschap waarop de solver en de modelcontrole beproefd worden.
  const perDeel = DELEN.map((d) => new Set(d.knopen));
  let overlap = 0;
  for (let i = 0; i < perDeel.length; i++)
    for (let j = i + 1; j < perDeel.length; j++)
      for (const k of perDeel[i]) if (perDeel[j].has(k)) overlap++;
  check("geen gedeelde knopen tussen de delen", overlap, 0);
  for (const d of DELEN) {
    const eigen = new Set(d.knopen);
    const binnen = d.staven.every((sid) => {
      const b = s.beams.find((x) => x.id === sid);
      return eigen.has(b.from) && eigen.has(b.to);
    });
    ok(`${d.naam}: alle staven blijven binnen het eigen deel`, binnen);
  }

  // Maatvoering, in mm — de afmetingen die de gebruiker heeft vastgelegd.
  const knoop = (id) => s.nodes.find((n) => n.id === id);
  check("portaaloverspanning (mm)", knoop(4).x - knoop(3).x, 12000);
  check("portaalhoogte (mm)", knoop(3).z - knoop(1).z, 5000);
  check("houten veld 1 (mm)", knoop(6).x - knoop(5).x, 5000);
  check("houten veld 2 (mm)", knoop(7).x - knoop(6).x, 5000);
  check("betonoverspanning (mm)", knoop(9).x - knoop(8).x, 6000);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[b] Doorsneden: elke profielnaam komt door zijn eigen ontleder");
{
  // `bron` zegt WELKE weg de doorsnede vond. Een naam die nergens op past
  // levert een terugval, en dan rekent de app met een doorsnede die de
  // gebruiker niet heeft ingevoerd — de stilste fout die er is.
  for (const [id, bron] of [[1, "staal-db"], [3, "staal-db"],
                            [4, "hout-bxh"], [6, "beton-bxh"]]) {
    const b = s.beams.find((x) => x.id === id);
    check(`staaf ${id} doorsnedebron`, resolveSection(b.material, b.profile).bron, bron);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[c] Opleggingen: het portaal schoort, de rechte liggers klemmen niet");
const multi = bouwMultiInput(model);
const perCase = solveAllCases(multi);
{
  // Twee scharnieren onder een rechte ligger zouden hem axiaal inklemmen:
  // elke zakking wil de ligger verlengen en dan ontstaat er een normaalkracht
  // die er in werkelijkheid niet is. Bij het portaal is de horizontale
  // reactie juist wél de bedoeling — dat ís het tweescharnierportaal.
  const r = perCase.perCase.get(1).reactions;
  const portaalH = Math.abs(r.get(1).fx) + Math.abs(r.get(2).fx);
  ok("portaal neemt horizontale kracht op (twee scharnieren)",
    portaalH > 1, `Σ|H| = ${(portaalH / 1000).toFixed(2)} kN`);
  for (const id of [5, 6, 7, 8, 9]) {
    const fx = Math.abs(r.get(id).fx);
    ok(`oplegging ${id} zonder horizontale dwang`, fx < 1e-6,
      `|H| = ${fx.toExponential(1)} N`);
  }
  // Precies één scharnier per rechte ligger: minder is een mechanisme, meer is
  // dwang.
  const tel = (ids, type) =>
    s.supports.filter((sp) => ids.includes(sp.nodeId) && sp.type === type).length;
  check("houten ligger: aantal scharnieren", tel([5, 6, 7], "pinned"), 1);
  check("houten ligger: aantal rollen", tel([5, 6, 7], "zRoller"), 2);
  check("betonnen balk: aantal scharnieren", tel([8, 9], "pinned"), 1);
  check("betonnen balk: aantal rollen", tel([8, 9], "zRoller"), 1);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[d] Validatie: de strenge poort van de sidecar laat het model door");
{
  // Door JSON heen: de sidecar krijgt het model óók als kale JSON binnen, en
  // deze poort keurt onbekende velden af. De wapeningskorf moet daar dus als
  // geldig veld bekend zijn.
  const v = valideerModel(JSON.parse(JSON.stringify(model)));
  ok("model geldig", v.ok, v.errors.join(" | "));
  check("aantal fouten", v.errors.length, 0);
  // Waarschuwingen mogen er zijn (sneeuw en wind hebben nog geen last), maar
  // niet over de losse delen: drie constructies naast elkaar is een geldig
  // model, geen vergeten verbinding.
  const overSamenhang = v.warnings.filter((w) =>
    /los|verbond|verbind|samenhang|niet-verbonden|zwevend/i.test(w));
  check("geen waarschuwing over de losse delen", overSamenhang.length, 0);
  ok("de bekende waarschuwingen gaan alleen over lege belastinggevallen",
    v.warnings.every((w) => /geen werkzame last/i.test(w)),
    v.warnings.join(" | "));

  // De tweede poort: de controle die in het canvas meeloopt. Die kijkt naar
  // vrije uiteinden — een staafeinde zonder oplegging en zonder aansluitende
  // staaf. Drie losse constructies zijn voor hém geen bezwaar zolang elk
  // uiteinde ergens op rust, en dat is precies wat de opleggingen doen.
  const bevindingen = controleerModel({
    nodes: s.nodes, beams: s.beams, supports: s.supports,
  });
  check("canvas-modelcontrole: aantal bevindingen", bevindingen.length, 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[e] Evenwicht: ΣF_z is exact de opgelegde last");
{
  // Handgerekend uit de invoer, niet uit een eerdere run:
  //   permanent  5 kN/m · 12 m + 4 kN/m · 10 m + 15 kN/m · 6 m = 190 kN
  //   variabel                   2,5 kN/m · 10 m + 10 kN/m · 6 m = 85 kN
  for (const [caseId, verwachtKN] of [[1, 190], [2, 85]]) {
    const res = perCase.perCase.get(caseId);
    ok(`belastinggeval ${caseId} is doorgerekend`, res !== undefined);
    if (!res) continue;
    let sz = 0;
    for (const [, v] of res.reactions) sz += v.fz;
    check(`belastinggeval ${caseId}: ΣF_z (kN)`, sz / 1000, verwachtKN, 1e-6);
  }
  // Zonder deze check zou een model dat álle drie de delen kwijt is ook
  // "evenwicht" halen.
  check("aantal opgeloste belastinggevallen", perCase.perCase.size, 2);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[f] Statische onbepaaldheid: per deel én voor het geheel");
{
  for (const d of DELEN) {
    const knopen = s.nodes.filter((n) => d.knopen.includes(n.id));
    const staven = s.beams.filter((b) => d.staven.includes(b.id));
    const opl = s.supports.filter((sp) => d.knopen.includes(sp.nodeId));
    const u = bepaalOnbepaaldheid(knopen, staven, opl, []);
    check(`${d.naam}: graad`, u.graad, d.graad);
    check(`${d.naam}: statisch bepaald`, u.statischBepaald, d.graad === 0);
  }
  const heel = bepaalOnbepaaldheid(s.nodes, s.beams, s.supports, perCase.perCase.values());
  // De formule telt de delen bij elkaar op; dat mag alleen als élk deel op
  // zichzelf stabiel is — precies wat de drie regels hierboven vastleggen.
  check("hele model: graad = som van de delen",
    heel.graad, DELEN.reduce((a, d) => a + d.graad, 0));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[g] Toetsbaarheid: de drie kernen pakken samen alle zes de staven op");
{
  const combos = defaultCombinations();
  const combinationResults = new Map(
    combos.map((c) => [c.id, combineResults(c, perCase.perCase)]),
  );
  // De profieldatabase komt in de app uit de rekenkern (`list_steel_profiles`);
  // die draait hier niet. Alleen de hoogte wordt door de bouwer gelezen (voor
  // het aangrijpingspunt van de last), dus die volstaat — dit is een toets op
  // de NAAM, niet op de profielwaarden.
  const profileDb = new Map([["HEA160", { geometry: { h: 152 } }]]);
  const data = { nodes: s.nodes, beams: s.beams, supports: s.supports,
                 combinations: combos, combinationResults };

  const staal = buildSteelCheckInputs({ ...data, profileDb });
  check("staal: aantal toetsinvoeren", staal.inputs.length, 3);
  check("staal: overgeslagen", staal.skipped.length, 0);

  const hout = buildTimberCheckInputs(data);
  check("hout: aantal toetsinvoeren", hout.inputs.length, 2);
  check("hout: overgeslagen", hout.skipped.length, 0);
  check("hout: sterkteklasse", hout.inputs[0]?.strength_class, "GL24h");
  check("hout: breedte (mm)", hout.inputs[0]?.width_mm, 160);
  check("hout: hoogte (mm)", hout.inputs[0]?.height_mm, 400);
  check("hout: overspanning (m)", hout.inputs[0]?.length_m, 5);

  const beton = buildBetonCheckInputs({ ...data, korven: korvenUitStaven(s.beams) });
  check("beton: aantal toetsinvoeren", beton.inputs.length, 1);
  check("beton: overgeslagen", beton.skipped.length, 0);
  const bi = beton.inputs[0];
  check("beton: sterkteklasse", bi?.concrete_class, "C30/37");
  check("beton: wapeningsstaal", bi?.reinforcement_grade, "B500B");
  check("beton: breedte (mm)", bi?.section.b_mm, 300);
  check("beton: hoogte (mm)", bi?.section.h_mm, 600);
  // De korf 1-op-1. Een korf waarin één onderdeel ontbreekt wordt niet als
  // fout gemeld maar als een ánder wapeningsplan doorgerekend; daarom staan
  // alle vier de onderdelen hier los genoemd.
  check("korf: dekking c_nom (mm)", bi?.cage.cover_mm, 20);
  check("korf: beugel Ø (mm)", bi?.cage.stirrup_diameter_mm, 8);
  check("korf: onderwapening aantal", bi?.cage.bottom.count, 4);
  check("korf: onderwapening Ø (mm)", bi?.cage.bottom.diameter_mm, 20);
  check("korf: bovenwapening aantal", bi?.cage.top.count, 2);
  check("korf: bovenwapening Ø (mm)", bi?.cage.top.diameter_mm, 12);

  const gedekt = new Set([...staal.inputs, ...hout.inputs, ...beton.inputs]
    .map((i) => i.beam_id));
  check("elke staaf komt bij precies één kern terecht", gedekt.size, 6);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[h] Lastomschrijvingen: elke last draagt een ingevulde naam");
{
  for (const l of s.loads) {
    ok(`last ${l.id} heeft een omschrijving`,
      typeof l.omschrijving === "string" && l.omschrijving.trim().length > 0,
      l.omschrijving ?? "(leeg)");
  }
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${"─".repeat(60)}`);
log(`Resultaat: ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
