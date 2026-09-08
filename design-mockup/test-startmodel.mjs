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
//  (b) DOORSNEDEN    — "IPE270", "IPE330", "160x400" en "300x600" komen alle
//      door hun eigen ontleder; geen enkele valt terug op een default. Ook de
//      NAMEN zelf liggen hier vast, want ze zijn gedimensioneerd en niet
//      gekozen (zie [i]), samen met de aangenomen kipsteunen op de regel.
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
//  (i) ECHTE TOETSING — het stalen portaal door de Rust-rekenkern heen: alle
//      drie de staven Ok, met een marge die noch nipt noch absurd ruim is.
//      Dit blok start de toetsbrug als apart proces en wordt LUID overgeslagen
//      als die binary ontbreekt.
//
// Uitvoeren: npx tsx test-startmodel.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=startmodel

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

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
const { buildSteelCheckInputs, profileLookupKey } =
  await import("./src/lib/steelCheckBuilder.ts");
const { selecteerCombinaties } = await import("./src/lib/combinatieSelectie.ts");
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

  // DE STALEN PROFIELNAMEN LIGGEN VAST, want ze zijn gedimensioneerd en niet
  // gekozen: het portaal stond op HEA 160 en kwam daarmee op alle drie de
  // staven NotOk uit de kern (kolommen uc 1,22 op kip, regel uc 4,00 op
  // doorbuiging). Blok [i] rekent na dát deze doorsneden voldoen; deze regels
  // leggen vast WELKE dat zijn, zodat een terugval naar het oude profiel niet
  // pas in een unity check opvalt.
  for (const [id, profiel] of [[1, "IPE270"], [2, "IPE270"], [3, "IPE330"]]) {
    check(`staaf ${id} profiel`, s.beams.find((x) => x.id === id).profile, profiel);
  }

  // De kipsteunen op de regel zijn een AANNAME (een dakvlak dat de bovenflens
  // vasthoudt) en geen rekenuitkomst. Ze staan hier apart omdat blok [i] laat
  // zien dat de regel zonder die aanname op kip afkeurt: verdwijnen ze stil
  // uit het model, dan verandert de uitkomst wezenlijk.
  const regel = s.beams.find((x) => x.id === 3);
  check("regel: aangenomen kipsteunen (fracties)",
    JSON.stringify(regel.checkConfig?.lateralRestraints ?? null),
    JSON.stringify([0.25, 0.5, 0.75]));
  ok("regel: geen ONDERflenssteunen aangenomen",
    regel.checkConfig?.lateralRestraintsBottom === undefined,
    "een gording houdt de gedrukte onderflens bij de hoeken niet vast");
  for (const id of [1, 2]) {
    const kolom = s.beams.find((x) => x.id === id);
    ok(`kolom ${id}: geen kipsteunen aangenomen`,
      kolom.checkConfig?.lateralRestraints === undefined,
      "een gevelregel steunt de buitenflens, terwijl hier de binnenflens gedrukt is");
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
  // de NAAM, niet op de profielwaarden. (Blok [i] gebruikt wél de echte
  // database, rechtstreeks uit de kern.)
  const profileDb = new Map([
    ["IPE270", { geometry: { h: 270 } }],
    ["IPE330", { geometry: { h: 330 } }],
  ]);
  const data = { nodes: s.nodes, beams: s.beams, supports: s.supports,
                 combinations: combos, combinationResults };

  const staal = buildSteelCheckInputs({ ...data, profileDb });
  check("staal: aantal toetsinvoeren", staal.inputs.length, 3);
  check("staal: overgeslagen", staal.skipped.length, 0);
  // De aangenomen kipsteunen moeten ook echt bij de kern aankomen: blijven ze
  // in de bouwer hangen, dan rekent de kern de regel als ongesteund over 12 m
  // door en klopt het profiel niet meer bij de aanname.
  const regelInvoer = staal.inputs.find((i) => i.beam_id === 3);
  check("staal: kipsteunen van de regel komen door (bovenflens)",
    JSON.stringify(regelInvoer?.lateral_bracing?.top_flange_positions ?? null),
    JSON.stringify([0.25, 0.5, 0.75]));
  check("staal: geen onderflenssteunen naar de kern",
    JSON.stringify(regelInvoer?.lateral_bracing?.bottom_flange_positions ?? null),
    JSON.stringify([]));

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

  // DE BGT-COMBINATIE VOOR DE SCHEURWIJDTE. §7.3 van EN 1992-1-1 toetst onder
  // de FREQUENTE combinatie (6.15) — de nationale bijlage bij 7.3.1(5)
  // schrijft die voor waar de EN-tekst de quasi-blijvende noemt. Komt die
  // omhullende niet mee, dan meldt de kern dat de scheurtoetsen niet konden
  // worden uitgevoerd, en dan blijft de halve betontoetsing ongedaan zonder
  // dat er iets ROOD wordt.
  check("beton: de frequente BGT-combinatie komt mee",
    (bi?.sls_frequent_envelope?.length ?? 0) > 0, true);
  check("beton: en die omhullende hoort bij combinatie 7 (SLS Frequent)",
    new Set((bi?.sls_frequent_envelope ?? []).map((p) => p.combination_id)).size === 1 &&
      bi?.sls_frequent_envelope[0]?.combination_id, 7);
  // De frequente combinatie is LICHTER dan de UGT: G + ψ₁·Q + ψ₂·S tegen
  // 1,35·G. Een omhullende die net zo zwaar is, is de verkeerde omhullende.
  const maxAbsM = (env) => Math.max(...(env ?? []).map((p) => Math.abs(p.forces.my_ed)), 0);
  check("beton: de frequente omhullende is lichter dan de UGT-omhullende",
    maxAbsM(bi?.sls_frequent_envelope) < maxAbsM(bi?.forces_envelope), true);

  // De milieuklasse stond al in het model voor de dekkingstoets van 4.4.1; §7.3
  // leest hem als ingang van tabel 7.1N (w_max). Blijft hij in de bouwer
  // hangen, dan meldt de scheurwijdtetoets dat de milieuklasse ontbreekt
  // terwijl hij gewoon is ingevuld.
  check("beton: milieuklasse komt door", bi?.exposure_class, "XC1");

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
log("\n[i] Echte rekenkern: het stalen portaal komt door de toetsing");
//
// WAAROM DIT BLOK BESTAAT. De doorsneden van het portaal zijn gedimensioneerd
// en niet gekozen: op HEA 160 kwamen alle drie de staven NotOk uit de kern
// (kolommen uc 1,22 op kip; de regel uc 4,00 op doorbuiging, 144 mm tegen een
// grens van 36 mm). Een startmodel dat half in het rood opent is onbruikbaar
// voor waar het voor is — wie iets roods ziet weet dan niet of de KETEN faalt
// of alleen de doorsnede te klein is. Dat de nieuwe doorsneden voldoen is niet
// met een formule na te rekenen: dat zegt de rekenkern, en dus draait die hier
// echt (JSON op stdin, JSON van stdout — dezelfde weg als de dev-server).
//
// De grenzen zijn een BAND en geen vaste waarde. Vastgeprikte unity checks
// zouden bij elke verbetering aan de kern omvallen zonder dat er iets mis is;
// wat het startmodel moet halen is juist een marge die geloofwaardig is: niet
// nipt (0,98 leest als toeval) en niet absurd ruim (0,15 leest als een fout in
// de last). De bovengrens bewaakt dat, de ondergrens ook.
{
  if (!existsSync(TOETSBRUG)) {
    failed++;
    log(`  ✗ de rekenkern ontbreekt: ${TOETSBRUG}`);
    log("    bouw hem met  cargo build --release -p toetsbrug  vanuit src-tauri;");
    log("    zonder hem is NIET aangetoond dat het startmodel door de toetsing komt.");
  } else {
    const kern = (opdracht, inputs) => {
      const r = spawnSync(TOETSBRUG, [], {
        input: JSON.stringify({ opdracht, inputs }),
        maxBuffer: 256 * 1024 * 1024,
        encoding: "utf8",
      });
      if (r.error) throw r.error;
      const data = JSON.parse(r.stdout);
      if (data && !Array.isArray(data) && typeof data === "object" && "fout" in data) {
        throw new Error(data.fout);
      }
      return data;
    };

    // Dezelfde weg als de app: combinatieselectie → oplossen → combineren →
    // invoer bouwen → kern. Geen tweede route, anders bewijst dit blok iets
    // over een model dat de gebruiker niet voor zich heeft.
    const { actief: combos } = selecteerCombinaties(defaultCombinations(), s.beams, s.plates);
    const combinationResults = new Map(
      combos.map((c) => [c.id, combineResults(c, perCase.perCase)]),
    );
    const profileDb = new Map();
    for (const p of kern("list_steel_profiles")) {
      const sleutel = profileLookupKey(p.name);
      if (!profileDb.has(sleutel)) profileDb.set(sleutel, p);
    }
    const { inputs } = buildSteelCheckInputs({
      nodes: s.nodes, beams: s.beams, supports: s.supports,
      combinations: combos, combinationResults, profileDb,
    });
    check("staal: invoeren die de kern in gaan", inputs.length, 3);

    const resultaten = kern("check_steel_beams", inputs);
    check("staal: resultaten uit de kern", resultaten.length, 3);

    // De band. 0,85 is de bovengrens uit de opdracht; 0,35 de ondergrens —
    // hout staat op 0,39 en beton op 0,52, dus "in dezelfde orde" begint daar.
    const BAND = { min: 0.35, max: 0.85 };
    for (const r of resultaten) {
      const uc = r.uc_max;
      ok(`staaf ${r.beam_id} (${r.profile_name} ${r.steel_grade}): status Ok`,
        r.status === "Ok",
        `maatgevend ${r.governing_check_id}, uc_max ${uc.toFixed(3)}`);
      ok(`staaf ${r.beam_id}: marge geloofwaardig (${BAND.min} ≤ uc ≤ ${BAND.max})`,
        uc >= BAND.min && uc <= BAND.max, `uc_max = ${uc.toFixed(3)}`);
      // Eén NotOk-deeltoets tussen twintig Ok's zou in uc_max verdwijnen als
      // de kern die toets niet meetelt; daarom ook per toets.
      const notOk = (r.checks ?? [])
        .map((c) => ({ id: c.id, status: (c.kind?.data ?? c).status }))
        .filter((c) => c.status !== "Ok");
      ok(`staaf ${r.beam_id}: geen enkele deeltoets NotOk`, notOk.length === 0,
        notOk.map((c) => c.id).join(", ") || "—");
    }

    // De kolommen worden door kip begrensd en de regel door de doorbuiging.
    // Dat is geen toeval maar het ontwerp: over 12 m is de zakking de eis die
    // het profiel bepaalt, bij de 5 m kolom het hoekmoment op de ongesteunde
    // binnenflens. Zou dat verschuiven, dan is er iets veranderd dat de lezer
    // van het startmodel moet weten.
    const per = new Map(resultaten.map((r) => [r.beam_id, r]));
    check("kolom 1: maatgevende toets", per.get(1)?.governing_check_id, "6.3.2_ltb");
    check("kolom 2: maatgevende toets", per.get(2)?.governing_check_id, "6.3.2_ltb");
    check("regel: maatgevende toets", per.get(3)?.governing_check_id, "deflection_w_add");

    // DE KIPSTEUNEN ZIJN NIET COSMETISCH. Dezelfde regel nog eens, maar met de
    // aanname weggehaald: zonder dakvlak dat de bovenflens vasthoudt keurt de
    // kern hem op kip AF. Dat is precies wat de aanname draagt, en daarom
    // staat het hier zwart op wit in plaats van alleen in een commentaarregel.
    const zonderSteun = JSON.parse(JSON.stringify(inputs.find((i) => i.beam_id === 3)));
    zonderSteun.lateral_bracing = { top_flange_positions: [], bottom_flange_positions: [] };
    const kaal = kern("check_steel_beams", [zonderSteun])[0];
    const kipKaal = (kaal.checks ?? []).find((c) => c.id === "6.3.2_ltb");
    const ucKaal = (kipKaal?.kind?.data ?? kipKaal)?.uc?.uc;
    ok("regel zónder de aangenomen kipsteunen: kip keurt af",
      ucKaal !== undefined && ucKaal > 1,
      `uc kip = ${ucKaal?.toFixed(3)} (mét steunen: ${
        (() => {
          const c = (per.get(3)?.checks ?? []).find((x) => x.id === "6.3.2_ltb");
          return ((c?.kind?.data ?? c)?.uc?.uc ?? NaN).toFixed(3);
        })()
      })`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${"─".repeat(60)}`);
log(`Resultaat: ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
