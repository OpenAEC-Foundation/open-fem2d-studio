// Het belastinggeval "Eigen gewicht" — issue #42, de REKENKANT.
//
// WAAROM DEZE TEST BESTAAT
// Eigen gewicht was een vinkje dat zijn lasten onzichtbaar in "het eerste
// blijvende geval" zette. Nu kan een geval het kenmerk `eigenGewicht: true`
// dragen. Dat raakt de rekengang, het projectbestand en de MCP-weg tegelijk, en
// er zijn twee manieren waarop het stil mis kan gaan:
//   - een NIEUW project rekent het eigen gewicht in het verkeerde geval, dubbel
//     of helemaal niet;
//   - een OUD project (zonder kenmerk) rekent opeens anders dan voorheen.
// Beide leggen deze test vast, met getallen uit handberekening.
//
// HANDBEREKENING (g = 9,81 m/s², de `G` van lib/sectionResolver)
//   Staal S235, IPE 200: ρ = 7850 kg/m³ (EN 1991-1-1 tabel A.4), A = 28,5 cm²
//     q = ρ·A·g = 7850 · 28,5e-4 · 9,81 = 219,474225 N/m = 0,219474225 kN/m
//     ligger op twee steunpunten, L = 6 m: R = q·L/2 = 0,658422675 kN
//   Hout GL24h, 160 × 400 mm: ρ_mean = 420 kg/m³ (EN 14080 tabel 5), A = 64 000 mm²
//     q = 420 · 0,064 · 9,81 = 263,6928 N/m = 0,2636928 kN/m
//     L = 5 m: R = 0,659232 kN
//   Ingevoerde permanente last op de stalen ligger: 2 kN/m → R = 6,000 kN
//   Plaat staal t = 200 mm: p = ρ·g·t = 7850 · 9,81 · 0,2 = 15 401,7 N/m² = 15,4017 kN/m²
//
// Blokken:
//  [1] de regel — kenmerk, eerste blijvende, kenmerk op niet-blijvend, geen;
//  [2] de standaardgevallen van een nieuw project — "Eigen gewicht" voorop met
//      id 5, de vier bestaande gevallen houden id 1–4;
//  [3] nieuw project: eigen gewicht in het eigen geval, q en oplegreacties
//      volgens de handberekening, en NIET in "Permanent (G)";
//  [4] één bron: het overzicht voor tekenvlak, tabel en rapport is letterlijk
//      de uitvoer van `eigenGewichtLasten`, en de getoonde afleiding klopt
//      (|q| = ρ·A·g); het werkt vanzelf bij als het profiel wijzigt;
//  [5] oud project: zonder kenmerk is de solverinvoer BYTE-GELIJK aan de oude
//      regel (onafhankelijk nagebouwd), met en zonder `selfWeightEnabled`, en
//      het projectbestand krijgt er bij lezen en schrijven geen kenmerk bij;
//  [6] combinaties: het geval telt als blijvende belasting — zelfde factor als
//      "Permanent (G)" in elke standaardcombinatie; UGT-reactie nagerekend;
//  [7] het aanbod: eigen gewicht verplaatsen verandert geen enkele
//      combinatie-uitkomst, ook niet in een eigen combinatie;
//  [8] drie wegen: projectbestand, `valideerModel` (weigeringen met reden) en
//      de sidecar (`solve`, `load_project`) kennen het kenmerk;
//  [9] het gekenmerkte geval verwijderen of van type wijzigen zet het eigen
//      gewicht UIT, met melding — de regel (pure functie op de uitkomst van
//      `verwijderBelastinggeval`/`wijzigBelastinggeval`) en de aansluiting in
//      de store (broncontrole: beide paden melden, in vier talen).
//
// Uitvoeren: npx tsx test-eigen-gewicht-geval.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=eigen-gewicht-geval

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { bouwMultiInput, eigenGewichtLasten, staafLengteMm } = await import("./src/lib/modelNaarSolverInput.ts");
const { G, dichtheidVanMateriaal } = await import("./src/lib/sectionResolver.ts");
const {
  eigenGewichtDoel, eigenGewichtGeval, standaardBelastinggevallen, HANDMATIGE_STANDAARDGEVALLEN,
  EIGEN_GEWICHT_STANDAARD_ID, EIGEN_GEWICHT_STANDAARD_AAN, EIGEN_GEWICHT_NAAM, STANDAARD_ACTIEF_GEVAL_ID,
  gevalNeemtHandmatigeLasten, eigenGewichtAanbodVanToepassing, eigenGewichtNaGevalWijziging,
} = await import("./src/lib/eigenGewicht.ts");
const { eigenGewichtOverzicht } = await import("./src/lib/eigenGewichtOverzicht.ts");
const {
  verplaatsEigenGewichtNaarEigenGeval, meldingenBelastinggevallen, volgendVrijId,
  verwijderBelastinggeval, wijzigBelastinggeval,
} = await import("./src/lib/combinatieBeheer.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
}
function gelijk(naam, gemeten, verwacht) {
  ok(naam, Object.is(gemeten, verwacht) || JSON.stringify(gemeten) === JSON.stringify(verwacht),
    `${JSON.stringify(gemeten)} vs ${JSON.stringify(verwacht)}`);
}
/** Relatieve vergelijking; drukt de gemeten afwijking altijd af. */
function rel(naam, gemeten, verwacht, tolRel = 1e-9) {
  const afw = Math.abs(gemeten - verwacht) / Math.max(Math.abs(verwacht), 1e-300);
  ok(naam, Number.isFinite(gemeten) && afw <= tolRel,
    `${Number(gemeten).toPrecision(10)} vs ${Number(verwacht).toPrecision(10)}, afwijking ${(afw * 100).toExponential(2)} %`);
}

// ── Handberekening ───────────────────────────────────────────────────────
const Q_STAAL = 7850 * 28.5e-4 * 9.81 / 1000;   // 0,219474225 kN/m
const Q_HOUT = 420 * 0.064 * 9.81 / 1000;       // 0,2636928 kN/m
const L_STAAL = 6, L_HOUT = 5;
const R_STAAL = Q_STAAL * L_STAAL / 2;          // 0,658422675 kN
const R_HOUT = Q_HOUT * L_HOUT / 2;             // 0,659232 kN
const Q_INGEVOERD = 2;                          // kN/m op de stalen ligger

/** Twee losse liggers op twee steunpunten: staal (knoop 1–2) en hout (3–4). */
const TWEE_LIGGERS = {
  nodes: [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 },
    { id: 3, x: 0, z: 3000 }, { id: 4, x: 5000, z: 3000 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: "S235", profile: "IPE200" },
    { id: 2, from: 3, to: 4, material: "GL24h", profile: "160x400" },
  ],
  supports: [
    { nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" },
    { nodeId: 3, type: "pinned" }, { nodeId: 4, type: "zRoller" },
  ],
  plates: [],
  loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -Q_INGEVOERD }],
  scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
};
const nieuwProject = (extra = {}) => ({
  ...TWEE_LIGGERS, loadCases: standaardBelastinggevallen(), selfWeightEnabled: EIGEN_GEWICHT_STANDAARD_AAN, ...extra,
});
/** Zoals elk projectbestand van vóór het kenmerk: alleen de vier handmatige gevallen. */
const oudProject = (selfWeightEnabled) => ({
  ...TWEE_LIGGERS, loadCases: HANDMATIGE_STANDAARDGEVALLEN.map((c) => ({ ...c })), selfWeightEnabled,
});
const rz = (uit, geval, knoop) => uit.perCase.get(geval).reactions.get(knoop).fz / 1000;

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De regel: welk geval krijgt het eigen gewicht");
// ─────────────────────────────────────────────────────────────────────────
{
  const G1 = { id: 1, name: "G", type: "dead" };
  const Q2 = { id: 2, name: "Q", type: "live" };
  const G3 = { id: 3, name: "G afbouw", type: "dead" };
  const EG = { id: 9, name: "EG", type: "dead", eigenGewicht: true };

  gelijk("geen kenmerk → het EERSTE blijvende geval (oude regel)", eigenGewichtDoel([Q2, G1, G3]), { soort: "eersteBlijvend", geval: G1 });
  gelijk("kenmerk → dat geval, ook als het niet het eerste blijvende is", eigenGewichtDoel([G1, Q2, EG]), { soort: "kenmerk", geval: EG });
  const opLive = { ...EG, type: "live" };
  gelijk("kenmerk op een veranderlijk geval → NIET toegepast, geen stille terugval", eigenGewichtDoel([G1, opLive]), { soort: "kenmerkNietBlijvend", geval: opLive });
  gelijk("geen blijvend geval → geen eigen gewicht", eigenGewichtDoel([Q2]), { soort: "geen" });

  gelijk("schakelaar uit → geen geval", eigenGewichtGeval([G1, EG], false), undefined);
  gelijk("schakelaar aan → het gekenmerkte geval", eigenGewichtGeval([G1, EG], true), EG);
  gelijk("schakelaar aan, kenmerk op veranderlijk → geen geval", eigenGewichtGeval([G1, opLive], true), undefined);
  ok("het gekenmerkte geval neemt geen handmatige lasten aan", gevalNeemtHandmatigeLasten([G1, EG], 9) === false);
  ok("een gewoon blijvend geval wel", gevalNeemtHandmatigeLasten([G1, EG], 1) === true);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Nieuw project: het standaardgeval \"Eigen gewicht\"");
// ─────────────────────────────────────────────────────────────────────────
{
  const gevallen = standaardBelastinggevallen();
  gelijk("vijf gevallen", gevallen.length, 5);
  gelijk("het eerste geval is \"Eigen gewicht\", blijvend, met kenmerk", gevallen[0],
    { id: EIGEN_GEWICHT_STANDAARD_ID, name: EIGEN_GEWICHT_NAAM, type: "dead", eigenGewicht: true });
  gelijk("direct daarna \"Permanent (G)\"", gevallen[1].name, "Permanent (G)");
  // De id's van de bestaande gevallen verschuiven NIET: lasten, tests en
  // clients die "caseId 1 = permanent" aannemen blijven kloppen.
  gelijk("de vier bestaande gevallen houden id 1–4, in dezelfde volgorde",
    gevallen.slice(1).map((c) => [c.id, c.name, c.type]),
    [[1, "Permanent (G)", "dead"], [2, "Variabel (Q)", "live"], [3, "Sneeuw (S)", "snow"], [4, "Wind (W)", "wind"]]);
  gelijk("id van het nieuwe geval = het volgende vrije id", EIGEN_GEWICHT_STANDAARD_ID, volgendVrijId(HANDMATIGE_STANDAARDGEVALLEN, 1));
  ok("precies één geval draagt het kenmerk", gevallen.filter((c) => c.eigenGewicht === true).length === 1);
  ok("eigen gewicht staat in een nieuw project AAN", EIGEN_GEWICHT_STANDAARD_AAN === true);
  gelijk("de actieve tab is het eerste HANDMATIGE geval (daar teken je lasten)", STANDAARD_ACTIEF_GEVAL_ID, 1);
  ok("elke aanroep geeft verse objecten", standaardBelastinggevallen()[0] !== gevallen[0]);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Nieuw project: eigen gewicht in het eigen geval, volgens de handberekening");
// ─────────────────────────────────────────────────────────────────────────
{
  gelijk("g zoals de app hem gebruikt", G, 9.81);
  gelijk("ρ staal (kg/m³)", dichtheidVanMateriaal("S235"), 7850);
  gelijk("ρ GL24h (kg/m³)", dichtheidVanMateriaal("GL24h"), 420);

  const model = nieuwProject();
  const mi = bouwMultiInput(model);
  const eg = mi.loads.filter((l) => l.caseId === EIGEN_GEWICHT_STANDAARD_ID);
  gelijk("twee gegenereerde lasten, één per staaf", eg.map((l) => l.beamId), [1, 2]);
  rel("q stalen staaf IPE 200 (kN/m)", eg[0].q, -Q_STAAL, 1e-12);
  rel("q houten staaf GL24h 160×400 (kN/m)", eg[1].q, -Q_HOUT, 1e-12);
  gelijk("\"Permanent (G)\" draagt ALLEEN de ingevoerde last",
    mi.loads.filter((l) => l.caseId === 1).map((l) => [l.beamId, l.q]), [[1, -Q_INGEVOERD]]);

  const uit = solveAllCases(mi);
  rel("geval Eigen gewicht: R_z staal, knoop 1 (kN)", rz(uit, 5, 1), R_STAAL);
  rel("geval Eigen gewicht: R_z staal, knoop 2 (kN)", rz(uit, 5, 2), R_STAAL);
  rel("geval Eigen gewicht: R_z hout, knoop 3 (kN)", rz(uit, 5, 3), R_HOUT);
  rel("geval Eigen gewicht: R_z hout, knoop 4 (kN)", rz(uit, 5, 4), R_HOUT);
  rel("geval Permanent: R_z staal zonder eigen gewicht (kN)", rz(uit, 1, 1), Q_INGEVOERD * L_STAAL / 2);
  ok("geval Permanent: de houten ligger is onbelast", Math.abs(rz(uit, 1, 3)) < 1e-12, `${rz(uit, 1, 3)}`);

  // De schakelaar blijft de schakelaar.
  const uitgezet = bouwMultiInput(nieuwProject({ selfWeightEnabled: false }));
  gelijk("schakelaar uit → geen enkele gegenereerde last", uitgezet.loads.map((l) => l.caseId), [1]);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Eén bron: wat getoond wordt is wat gerekend wordt");
// ─────────────────────────────────────────────────────────────────────────
{
  const model = nieuwProject();
  const ov = eigenGewichtOverzicht(model);
  const mi = bouwMultiInput(model);
  const gerekend = mi.loads.filter((l) => l.caseId === 5);
  gelijk("het overzicht wijst naar het gekenmerkte geval", ov.caseId, 5);
  gelijk("aantal lasten voor de teller op de tab", ov.aantalLasten, 2);
  const getoond = ov.staven.flatMap((s) => s.delen.map((d) => ({ beamId: s.beamId, q: d.q })));
  ok("elke getoonde q is BIT-GELIJK aan de q in de solverinvoer",
    getoond.length === gerekend.length && getoond.every((d, i) => d.beamId === gerekend[i].beamId && Object.is(d.q, gerekend[i].q)));
  for (const s of ov.staven) {
    for (const d of s.delen) {
      rel(`staaf ${s.beamId}: de getoonde afleiding klopt, ρ·A·g/1000 = |q|`, s.rho * (d.A_mm2 * 1e-6) * ov.g / 1000, Math.abs(d.q), 1e-12);
    }
  }
  gelijk("afleiding staal: ρ, A", [ov.staven[0].rho, ov.staven[0].delen[0].A_mm2], [7850, 2850]);
  gelijk("afleiding hout: ρ, A", [ov.staven[1].rho, ov.staven[1].delen[0].A_mm2], [420, 64000]);
  rel("totaal gewicht van de staven (kN)", ov.gewichtStavenKN, Q_STAAL * L_STAAL + Q_HOUT * L_HOUT, 1e-12);

  // Werkt vanzelf bij: ander profiel → andere last, zonder dat iemand iets invoert.
  const zwaarder = nieuwProject({ beams: [{ ...TWEE_LIGGERS.beams[0], profile: "IPE270" }, TWEE_LIGGERS.beams[1]] });
  rel("ander profiel (IPE 270, A = 45,9 cm²) → q volgt (kN/m)",
    eigenGewichtOverzicht(zwaarder).staven[0].delen[0].q, -(7850 * 45.9e-4 * 9.81 / 1000), 1e-12);
  // Andere geometrie → ander gewicht.
  const langer = nieuwProject({ nodes: TWEE_LIGGERS.nodes.map((n) => (n.id === 2 ? { ...n, x: 8000 } : n)) });
  rel("langere staaf (8 m) → totaal gewicht volgt (kN)", eigenGewichtOverzicht(langer).staven[0].gewichtKN, Q_STAAL * 8, 1e-12);

  // Verlopend profiel: per segment een deellast, dezelfde als in de rekengang.
  const verlopend = nieuwProject({
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: "100x400", profileEnd: "100x200" }, TWEE_LIGGERS.beams[1]],
  });
  const ovV = eigenGewichtOverzicht(verlopend);
  const direct = eigenGewichtLasten(verlopend.beams[0], staafLengteMm(verlopend.beams[0], verlopend.nodes), 5);
  ok("verlopend: het overzicht heeft dezelfde delen als `eigenGewichtLasten`",
    direct.length > 1 && ovV.staven[0].delen.length === direct.length &&
    ovV.staven[0].delen.every((d, i) => Object.is(d.q, direct[i].q) && d.startFrac === direct[i].startFrac && d.endFrac === direct[i].endFrac),
    `${direct.length} delen`);
  rel("verlopend: totaal = ρ·g·gemiddelde A·L (kN)", ovV.staven[0].gewichtKN, 420 * 9.81 * (0.1 * 0.3) * 6 / 1000, 1e-12);

  // Plaat: vlaklast ρ·g·t.
  const metPlaat = nieuwProject({
    nodes: [...TWEE_LIGGERS.nodes, { id: 5, x: 0, z: 6000 }, { id: 6, x: 2000, z: 6000 }, { id: 7, x: 2000, z: 8000 }, { id: 8, x: 0, z: 8000 }],
    plates: [{ id: 1, nodeIds: [5, 6, 7, 8], thickness: 200 }],
  });
  const ovP = eigenGewichtOverzicht(metPlaat);
  rel("plaat staal t = 200 mm: p = ρ·g·t (kN/m²)", ovP.platen[0].p, -(7850 * 9.81 * 0.2 / 1000), 1e-12);
  gelijk("de plaat telt mee in het aantal", ovP.aantalLasten, 3);
  gelijk("en de rekengang zet het plaatgewicht in hetzelfde geval", bouwMultiInput(metPlaat).plates[0].selfWeightCaseId, 5);

  // Schakelaar uit → er wordt niets gegenereerd, dus er valt niets te tonen.
  const uit = eigenGewichtOverzicht(nieuwProject({ selfWeightEnabled: false }));
  gelijk("schakelaar uit → leeg overzicht", [uit.caseId, uit.staven.length, uit.aantalLasten], [null, 0, 0]);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Oud project: niets stil omgezet, solverinvoer byte-gelijk aan de oude regel");
// ─────────────────────────────────────────────────────────────────────────
{
  // De oude regel, ONAFHANKELIJK nagebouwd: neem de invoer zonder eigen
  // gewicht en zet er de lasten van `eigenGewichtLasten` vóór, in het eerste
  // geval van type "dead", plus `selfWeightCaseId` op elke plaat. Zo stond het
  // letterlijk in `bouwMultiInput` vóór issue #42.
  const oudeRegel = (model) => {
    const mi = bouwMultiInput({ ...model, selfWeightEnabled: false });
    const dead = model.loadCases.find((c) => c.type === "dead");
    if (!dead) return mi;
    const eg = model.beams.flatMap((b) => eigenGewichtLasten(b, staafLengteMm(b, model.nodes), dead.id));
    mi.loads = [...eg, ...mi.loads];
    for (const p of mi.plates ?? []) p.selfWeightCaseId = dead.id;
    return mi;
  };
  const aan = oudProject(true);
  ok("oud project MET eigen gewicht: solverinvoer byte-gelijk aan de oude regel",
    JSON.stringify(bouwMultiInput(aan)) === JSON.stringify(oudeRegel(aan)));
  const uit = oudProject(false);
  ok("oud project ZONDER eigen gewicht: solverinvoer byte-gelijk, geen gegenereerde last",
    JSON.stringify(bouwMultiInput(uit)) === JSON.stringify(bouwMultiInput({ ...uit, selfWeightEnabled: false })) &&
    bouwMultiInput(uit).loads.length === 1);
  // Meer blijvende gevallen, het eerste niet vooraan: nog steeds het EERSTE "dead".
  const gemengd = {
    ...aan,
    loadCases: [{ id: 2, name: "Q", type: "live" }, { id: 7, name: "G afbouw", type: "dead" }, { id: 1, name: "G", type: "dead" }],
  };
  ok("oud project, blijvend geval niet vooraan: byte-gelijk aan de oude regel",
    JSON.stringify(bouwMultiInput(gemengd)) === JSON.stringify(oudeRegel(gemengd)));
  gelijk("… en dat is geval 7, het eerste van type dead", bouwMultiInput(gemengd).loads[0].caseId, 7);

  const res = solveAllCases(bouwMultiInput(aan));
  rel("oud project: R_z staal in geval 1 = ingevoerd + eigen gewicht (kN)", rz(res, 1, 1), Q_INGEVOERD * L_STAAL / 2 + R_STAAL);

  // Het bestand: lezen en schrijven voegt geen kenmerk toe en verandert de gevallen niet.
  const tekst = serializeProject({ ...aan, activeLoadCaseId: 1, nonlinearEnabled: false });
  const terug = deserializeProject(tekst);
  gelijk("oud bestand: de gevallen komen ongewijzigd terug", terug.loadCases, aan.loadCases);
  ok("oud bestand: geen enkel geval krijgt stil het kenmerk", terug.loadCases.every((c) => !("eigenGewicht" in c)));
  gelijk("oud bestand: selfWeightEnabled blijft zoals opgeslagen", terug.selfWeightEnabled, true);
  ok("oud bestand: opnieuw opslaan geeft dezelfde tekst",
    serializeProject({ ...terug, activeLoadCaseId: 1, nonlinearEnabled: false }) === tekst);
  ok("het aanbod is van toepassing op een oud project met eigen gewicht aan", eigenGewichtAanbodVanToepassing(aan) === true);
  ok("… niet als het eigen gewicht uit staat", eigenGewichtAanbodVanToepassing(uit) === false);
  ok("… en niet in een nieuw project", eigenGewichtAanbodVanToepassing(nieuwProject()) === false);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Combinaties: het geval telt als blijvende belasting");
// ─────────────────────────────────────────────────────────────────────────
{
  const gevallen = standaardBelastinggevallen();
  const combis = defaultCombinations(gevallen);
  ok("elke standaardcombinatie geeft \"Eigen gewicht\" dezelfde factor als \"Permanent (G)\"",
    combis.length > 0 && combis.every((c) => (c.factors.get(5) ?? 0) === (c.factors.get(1) ?? 0) && (c.factors.get(5) ?? 0) !== 0),
    `${combis.length} combinaties`);
  ok("in elke BGT-combinatie is die factor 1,0 (ψ = 1,0 voor blijvend)",
    combis.filter((c) => c.type === "sls").every((c) => c.factors.get(5) === 1));
  // Het AANTAL combinaties verandert niet door het extra blijvende geval: alle
  // blijvende gevallen samen zijn één G.
  gelijk("even veel standaardcombinaties als met alleen de vier handmatige gevallen",
    combis.length, defaultCombinations(HANDMATIGE_STANDAARDGEVALLEN).length);

  // UGT nagerekend op de combinatie met alleen blijvende belasting (6.10a).
  const model = nieuwProject();
  const perCase = solveAllCases(bouwMultiInput(model)).perCase;
  const alleenG = combis.find((c) => c.type === "uls" && [2, 3, 4].every((id) => (c.factors.get(id) ?? 0) === 0));
  ok("er is een UGT-combinatie met alleen blijvende belasting", alleenG !== undefined, alleenG?.name ?? "");
  const gammaG = alleenG.factors.get(1);
  const gecombineerd = combineResults(alleenG, perCase);
  rel(`UGT "${alleenG.name}": R_z staal = γ_G·(ingevoerd + eigen gewicht), γ_G = ${gammaG} (kN)`,
    gecombineerd.reactions.get(1).fz / 1000, gammaG * (Q_INGEVOERD * L_STAAL / 2 + R_STAAL));

  // Geen melding dat het geval leeg is of niet meetelt: het draagt het eigen gewicht.
  const meldingen = meldingenBelastinggevallen({
    loadCases: gevallen, combinations: combis, alleCombinaties: combis, loads: model.loads, selfWeightEnabled: true,
  });
  gelijk("geen melding over het geval \"Eigen gewicht\"", meldingen.filter((m) => m.caseId === 5).map((m) => m.tekst), []);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Het aanbod: verplaatsen naar een eigen geval verandert geen uitkomst");
// ─────────────────────────────────────────────────────────────────────────
{
  const gevallen = HANDMATIGE_STANDAARDGEVALLEN.map((c) => ({ ...c }));
  const standaard = defaultCombinations(gevallen);
  // Een EIGEN combinatie erbij: die volgt de standaardset niet, dus het nieuwe
  // geval moet daar de factor van het geval van herkomst krijgen — anders telt
  // het eigen gewicht er stil als nul.
  const eigen = { id: 900, name: "Eigen 1,2G + 1,5Q", type: "uls", formula: "1,2·G + 1,5·Q", factors: new Map([[1, 1.2], [2, 1.5]]) };
  const voor = {
    loadCases: gevallen, combinations: [...standaard, eigen], gevolgklasse: "CC2", bijlage: "NL",
    volgendGevalId: 5, volgendCombinatieId: 901,
  };
  const r = verplaatsEigenGewichtNaarEigenGeval(voor);
  gelijk("het nieuwe geval krijgt het volgende vrije id", r.id, 5);
  gelijk("het eigen gewicht komt uit het eerste blijvende geval", r.vanId, 1);
  gelijk("het nieuwe geval staat VOORAAN, blijvend, met kenmerk", r.staat.loadCases[0],
    { id: 5, name: EIGEN_GEWICHT_NAAM, type: "dead", eigenGewicht: true });
  gelijk("de bestaande gevallen zijn ongewijzigd", r.staat.loadCases.slice(1), gevallen);
  gelijk("de teller loopt door", r.staat.volgendGevalId, 6);
  gelijk("de eigen combinatie geeft het nieuwe geval de factor van geval 1", r.staat.combinations.find((c) => c.id === 900).factors.get(5), 1.2);
  ok("een tweede keer aanbieden doet niets (er is al een gekenmerkt geval)",
    verplaatsEigenGewichtNaarEigenGeval(r.staat).staat === r.staat);

  // Uitkomsten vóór en na: elke combinatie, elke oplegreactie.
  const modelVoor = { ...TWEE_LIGGERS, loadCases: voor.loadCases, selfWeightEnabled: true };
  const modelNa = { ...TWEE_LIGGERS, loadCases: r.staat.loadCases, selfWeightEnabled: true };
  const pcVoor = solveAllCases(bouwMultiInput(modelVoor)).perCase;
  const pcNa = solveAllCases(bouwMultiInput(modelNa)).perCase;
  gelijk("vóór en na evenveel combinaties", r.staat.combinations.length, voor.combinations.length);
  let grootste = 0;
  for (const cv of voor.combinations) {
    const cn = r.staat.combinations.find((c) => c.id === cv.id);
    const a = combineResults(cv, pcVoor), b = combineResults(cn, pcNa);
    for (const knoop of [1, 2, 3, 4]) {
      grootste = Math.max(grootste, Math.abs(a.reactions.get(knoop).fz - b.reactions.get(knoop).fz));
    }
  }
  ok("geen enkele oplegreactie in geen enkele combinatie verandert (N)", grootste < 1e-6, `grootste verschil ${grootste.toExponential(2)} N`);
  rel("na het verplaatsen: geval 1 draagt alleen de ingevoerde last (kN)", rz({ perCase: pcNa }, 1, 1), Q_INGEVOERD * L_STAAL / 2);
  rel("na het verplaatsen: het nieuwe geval draagt het eigen gewicht (kN)", rz({ perCase: pcNa }, 5, 1), R_STAAL);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Drie wegen: projectbestand, valideerModel en de sidecar kennen het kenmerk");
// ─────────────────────────────────────────────────────────────────────────
{
  const model = nieuwProject();
  // Projectbestand.
  const tekst = serializeProject({ ...model, activeLoadCaseId: 1, nonlinearEnabled: false });
  const terug = deserializeProject(tekst);
  gelijk("projectbestand: het kenmerk komt heen en terug", terug.loadCases, model.loadCases);

  // valideerModel — door JSON heen, zoals de sidecar het model krijgt.
  const kaal = () => JSON.parse(JSON.stringify(model));
  const v = valideerModel(kaal());
  ok("valideerModel: een nieuw project is geldig", v.ok, v.errors.join(" | "));
  ok("valideerModel: het geval \"Eigen gewicht\" geldt NIET als leeg",
    !v.warnings.some((w) => /Belastinggeval 5 .*geen werkzame last/.test(w)), v.warnings.join(" | "));
  const weiger = (naam, muteer, woord) => {
    const m = kaal(); muteer(m);
    const u = valideerModel(m);
    ok(`valideerModel weigert: ${naam}`, u.ok === false && u.errors.some((e) => e.includes(woord)), u.errors.join(" | ").slice(0, 160));
  };
  weiger("eigenGewicht: false", (m) => { m.loadCases[0].eigenGewicht = false; }, "alleen de waarde true");
  weiger("het kenmerk op een veranderlijk geval", (m) => { m.loadCases[0].type = "live"; }, 'type "dead"');
  weiger("twee gevallen met het kenmerk", (m) => { m.loadCases[1].eigenGewicht = true; }, "hoogstens één");
  weiger("een last in het gekenmerkte geval", (m) => { m.loads[0].caseId = 5; }, "automatisch");
  weiger("een tikfout in de veldnaam (strikt)", (m) => { m.loadCases[0].eigengewicht = true; }, "eigengewicht");

  // Sidecar, in-proces: dezelfde code als de MCP-server aanroept.
  const antw = verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model: kaal() } });
  ok("sidecar solve met het kenmerk slaagt", antw.ok === true, antw.error?.melding ?? "");
  rel("sidecar: R_z staal in geval 5 (kN)", antw.result?.per_case?.["5"]?.reactions?.["1"]?.fz ?? NaN, R_STAAL);
  rel("sidecar: R_z hout in geval 5 (kN)", antw.result?.per_case?.["5"]?.reactions?.["3"]?.fz ?? NaN, R_HOUT);
  rel("sidecar: R_z staal in geval 1, zonder eigen gewicht (kN)", antw.result?.per_case?.["1"]?.reactions?.["1"]?.fz ?? NaN, Q_INGEVOERD * L_STAAL / 2);
  const geweigerd = verwerkVerzoek({ v: 1, id: 2, op: "solve", payload: { model: (() => { const m = kaal(); m.loads[0].caseId = 5; return m; })() } });
  ok("sidecar weigert een last in het gekenmerkte geval, met reden",
    geweigerd.ok === false && geweigerd.error?.code === "INVOER_ONGELDIG" &&
    (geweigerd.error?.detail?.fouten ?? []).some((f) => /automatisch/.test(f)),
    `${geweigerd.error?.code}: ${(geweigerd.error?.detail?.fouten ?? []).join(" | ").slice(0, 100)}`);

  const geladen = verwerkVerzoek({ v: 1, id: 3, op: "load_project", payload: { inhoud: tekst } });
  ok("sidecar load_project leest het bestand", geladen.ok === true, geladen.error?.melding ?? "");
  gelijk("sidecar load_project: het kenmerk staat in het teruggegeven model", geladen.result?.model?.loadCases?.[0],
    { id: 5, name: EIGEN_GEWICHT_NAAM, type: "dead", eigenGewicht: true });
  gelijk("sidecar load_project: eigen gewicht aan", geladen.result?.model?.selfWeightEnabled, true);
  ok("sidecar load_project: de standaardcombinaties nemen geval 5 mee als blijvend",
    (geladen.result?.combinations ?? []).length > 0 &&
    geladen.result.combinations.every((c) => c.factors["5"] === c.factors["1"]));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[9] Het geval verwijderen of van type wijzigen: eigen gewicht UIT, met melding");
// ─────────────────────────────────────────────────────────────────────────
{
  const gevallen = standaardBelastinggevallen();
  const staat = {
    loadCases: gevallen, combinations: defaultCombinations(gevallen), gevolgklasse: "CC2", bijlage: "NL",
    volgendGevalId: 6, volgendCombinatieId: 100,
  };

  // Verwijderen — met de echte functie van de store.
  const naVerwijderen = verwijderBelastinggeval(staat, EIGEN_GEWICHT_STANDAARD_ID);
  ok("verwijderen haalt het geval weg", !naVerwijderen.loadCases.some((c) => c.id === EIGEN_GEWICHT_STANDAARD_ID));
  gelijk("verwijderen → eigen gewicht UIT, reden \"verwijderd\"",
    eigenGewichtNaGevalWijziging({ voor: gevallen, na: naVerwijderen.loadCases, selfWeightEnabled: true }),
    { uitzetten: true, reden: "verwijderd", geval: gevallen[0] });

  // Type wijzigen — het kenmerk gaat eraf (anders ψ₂ = 0,3 voor eigen gewicht).
  const naType = wijzigBelastinggeval(staat, EIGEN_GEWICHT_STANDAARD_ID, { type: "live" });
  const gewijzigd = naType.loadCases.find((c) => c.id === EIGEN_GEWICHT_STANDAARD_ID);
  ok("type wijzigen haalt het kenmerk weg", gewijzigd?.type === "live" && gewijzigd.eigenGewicht === undefined,
    JSON.stringify(gewijzigd));
  gelijk("type wijzigen → eigen gewicht UIT, reden \"typeGewijzigd\"",
    eigenGewichtNaGevalWijziging({ voor: gevallen, na: naType.loadCases, selfWeightEnabled: true })?.reden,
    "typeGewijzigd");
  // Zonder de uitschakeling zou het eigen gewicht STIL naar "Permanent (G)"
  // verhuizen — precies wat de melding voorkomt. Dat bewijst waarom hij nodig is.
  gelijk("… zonder uitschakelen zou de oude regel het stil in geval 1 zetten",
    eigenGewichtGeval(naType.loadCases, true)?.id, 1);

  // Geen melding als er niets verandert voor het eigen gewicht.
  gelijk("hernoemen → geen melding",
    eigenGewichtNaGevalWijziging({
      voor: gevallen, na: wijzigBelastinggeval(staat, EIGEN_GEWICHT_STANDAARD_ID, { name: "EG" }).loadCases,
      selfWeightEnabled: true,
    }), null);
  gelijk("een ánder geval verwijderen → geen melding",
    eigenGewichtNaGevalWijziging({ voor: gevallen, na: verwijderBelastinggeval(staat, 3).loadCases, selfWeightEnabled: true }),
    null);
  gelijk("schakelaar stond al uit → geen melding",
    eigenGewichtNaGevalWijziging({ voor: gevallen, na: naVerwijderen.loadCases, selfWeightEnabled: false }), null);
  const oud = HANDMATIGE_STANDAARDGEVALLEN.map((c) => ({ ...c }));
  gelijk("oud project zonder kenmerk: geval 1 verwijderen → geen melding van deze regel",
    eigenGewichtNaGevalWijziging({ voor: oud, na: oud.filter((c) => c.id !== 1), selfWeightEnabled: true }), null);

  // De aansluiting in de store: beide paden roepen de regel aan en melden.
  // Bronbestanden, want de hook zelf draait niet buiten React.
  const { readFileSync } = await import("node:fs");
  const lees = (pad) => readFileSync(new URL(pad, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  // Pad in delen: de bundelstand van run-tests.mjs herschrijft elke
  // "./src/….ts"-tekst naar de bundel, en dit is een bronbestand, geen import.
  const store = lees(["./src/hooks", "useFemStore.ts"].join("/"));
  const blok = (sleutel) => {
    const i = store.indexOf(`    ${sleutel}: (id`);
    return i < 0 ? "" : store.slice(i, store.indexOf("\n    },", i));
  };
  ok("store: removeLoadCase zet het eigen gewicht uit via de regel", /eigenGewichtUitNa\(voor, na\)/.test(blok("removeLoadCase")));
  ok("store: updateLoadCase zet het eigen gewicht uit via de regel", /eigenGewichtUitNa\(voor, na\)/.test(blok("updateLoadCase")));
  ok("store: de uitschakeling meldt altijd (setSelfWeightEnabled(false) + meldEigenGewichtUit)",
    /setSelfWeightEnabled\(false\);\s*\n\s*meldEigenGewichtUit\(gevolg\.reden/.test(store));
  for (const taal of ["nl", "en", "de", "fr"]) {
    const eg = JSON.parse(lees(`./src/i18n/locales/${taal}/common.json`)).eigenGewicht ?? {};
    ok(`melding in het ${taal}: titel en beide redenen`,
      typeof eg.uitgezetTitel === "string" && typeof eg.uitgezet?.verwijderd === "string" &&
      typeof eg.uitgezet?.typeGewijzigd === "string" && eg.uitgezet.verwijderd.includes("{{naam}}"));
  }
}

log(`\n${failed === 0 ? "GESLAAGD" : "GEFAALD"}:${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
