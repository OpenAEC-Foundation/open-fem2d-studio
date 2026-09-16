// Het projectbestand (.ifcfem2d) bewaart ALLES wat bij het project hoort:
// het model met al zijn staafvelden (aansluitingen, veren, bedding, korf,
// zones, milieuklasse, belastingtype), en daarnaast de projectgegevens, de
// windinstellingen en de rapportinstellingen. Die laatste drie stonden
// alleen in de app-instellingen van de machine en reisden niet mee.
//
// Uitvoeren: npx tsx test-projectbestand.mjs

const {
  serializeProject, deserializeProject, PROJECT_FORMAT_VERSION,
  combinationsFromFile, onbekendeTopVelden,
} = await import("./src/io/projectFile.ts");
const { rapportSnapshot, pasRapportSnapshotToe, useReportStore } =
  await import("./src/stores/reportStore.ts");

let geslaagd = 0;
let gefaald = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(voorwaarde, omschrijving, toelichting = "") {
  if (voorwaarde) { geslaagd += 1; log(`  ok   ${omschrijving}`); }
  else { gefaald += 1; log(`  FOUT ${omschrijving}${toelichting ? ` — ${toelichting}` : ""}`); }
}

const staaf = {
  id: 7, from: 1, to: 2, material: "C30/37", profile: "300x500",
  releases: { startRy: true },
  veren: { endRy: 5000, startTx: 200 },
  bedding: { k: 50000, b: 300 },
  loadRole: "dakHellend",
  checkConfig: {
    betonKorf: { bottom: { count: 3, diameter_mm: 20 }, top: { count: 2, diameter_mm: 12 }, cover_mm: 30, stirrup_diameter_mm: 8, stirrup_legs: 4 },
    betonMilieuklasse: "XC3",
    betonZones: { longitudinal: [{ x0_mm: 0, x1_mm: 2000, side: "Bottom", count: 3, diameter_mm: 20 }], stirrups: [] },
    bucklingLengthY: 4000,
  },
};
const model = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
  beams: [staaf],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zSpring", k: 12 }],
  plates: [],
  loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 7, q: -10, qDir: "z", omschrijving: "eigen gewicht dak" }],
  loadCases: [{ id: 1, name: "Permanent", type: "dead" }, { id: 4, name: "Wind (W)", type: "wind", gegenereerd: { bron: "wind", sleutel: "wind:links:cpi-0.30" } }],
  activeLoadCaseId: 1,
  selfWeightEnabled: true,
  nonlinearEnabled: false,
  // "eerste-orde" (met streepje) stond hier en is GEEN geldig analysetype; de
  // fixture kwam er alleen mee weg omdat `analysetypeUitBestand` een onbekende
  // waarde stil op de booleaan liet terugvallen (basisaudit ruw 28). Sinds die
  // terugval geweigerd wordt, hoort hier de echte spelling te staan.
  analysetype: "eersteOrde",
  combinations: [{ id: 1, name: "UGT", type: "uls", formula: "1,35G", factors: { 1: 1.35 } }],
  projectInfo: {
    name: "Loods Zuid", projectNumber: "2026-041", engineer: "M. de Vries", company: "Bureau X",
    date: "2026-09-11", description: "Kap op bestaande wanden", notes: "", location: "Delft",
    uitgangspunten: { normen: ["NEN-EN 1990"], gevolgklasse: "CC2", windgebied: "II", terreincategorie: "III" },
    reportHeader: "Bureau X · Constructieberekening",
  },
  windInstellingen: { windgebied: "II", terreincategorie: "III", hohSpant_m: 4.5, gevelhoogte_m: 3, richtingLinks: true, richtingRechts: false, richtingHaaks: true },
  rapport: {
    margeBoven: 22, margeOnder: 20, margeBinnen: 15, margeBuiten: 15, basisLettergrootte: 9.5, regelafstand: 1.4,
    pageSize: "A3", orientation: "landscape", hiddenSections: { platen: true }, rapportType: "beperkt",
    toetsingDetail: "gedetailleerd", verborgenToetsStaven: { "7": true }, inhoudsopgaveDiepte: 2,
  },
};

log("\n1. Alles wat erin gaat komt er ongewijzigd uit");
{
  const tekst = serializeProject(model);
  const terug = deserializeProject(tekst);
  ok(terug.version === PROJECT_FORMAT_VERSION && terug.format === "open-fem2d-studio-v2", "formaat en versie");
  const b = terug.beams[0];
  ok(JSON.stringify(b.veren) === JSON.stringify(staaf.veren), "veren van de staaf");
  ok(JSON.stringify(b.bedding) === JSON.stringify(staaf.bedding), "bedding van de staaf");
  ok(JSON.stringify(b.releases) === JSON.stringify(staaf.releases), "scharnieren van de staaf");
  ok(b.loadRole === "dakHellend", "belastingtype van de staaf");
  ok(JSON.stringify(b.checkConfig) === JSON.stringify(staaf.checkConfig), "toetsconfig met korf, milieuklasse en zones");
  ok(JSON.stringify(terug.projectInfo) === JSON.stringify(model.projectInfo), "projectgegevens, inclusief uitgangspunten en koptekst");
  ok(JSON.stringify(terug.windInstellingen) === JSON.stringify(model.windInstellingen), "windinstellingen, inclusief gevelhoogte");
  ok(JSON.stringify(terug.rapport) === JSON.stringify(model.rapport), "rapportinstellingen");
  ok(JSON.stringify(terug.loadCases[1].gegenereerd) === JSON.stringify(model.loadCases[1].gegenereerd), "het gegenereerde windgeval houdt zijn sleutel");
  ok(terug.loads[0].omschrijving === "eigen gewicht dak", "de omschrijving van een last");
  ok(JSON.stringify(terug.supports[1]) === JSON.stringify(model.supports[1]), "de veeroplegging met k");
  ok(typeof terug.savedAt === "string" && terug.savedAt.length > 10, "savedAt-stempel");
}

log("\n2. Een bestand van vóór deze velden laadt gewoon");
{
  const oud = { ...model };
  delete oud.projectInfo; delete oud.windInstellingen; delete oud.rapport;
  const terug = deserializeProject(serializeProject(oud));
  ok(terug.projectInfo === undefined && terug.windInstellingen === undefined && terug.rapport === undefined,
    "de drie velden ontbreken zonder fout");
  ok(terug.beams[0].veren?.endRy === 5000, "het model is compleet");
  let fout = null;
  try { deserializeProject(JSON.stringify({ ...oud, format: "open-fem2d-studio-v2", version: PROJECT_FORMAT_VERSION + 1 })); }
  catch (e) { fout = e; }
  ok(fout !== null && /nieuwere versie/.test(fout.message), "een nieuwer bestand wordt eerlijk geweigerd");
}

log("\n3. De rapportinstellingen: snapshot en terugzetten");
{
  pasRapportSnapshotToe(model.rapport);
  const s = useReportStore.getState();
  ok(s.pageSize === "A3" && s.orientation === "landscape" && s.rapportType === "beperkt" && s.toetsingDetail === "gedetailleerd",
    "papier, oriëntatie, rapporttype en toetsdetail");
  ok(s.margeBoven === 22 && s.basisLettergrootte === 9.5 && s.inhoudsopgaveDiepte === 2, "opmaak en inhoudsopgave");
  ok(s.hiddenSections.platen === true && s.verborgenToetsStaven["7"] === true, "sectiekeuze en staafkeuze");
  const snap = rapportSnapshot();
  ok(JSON.stringify(snap) === JSON.stringify(model.rapport), "de snapshot is precies wat erin ging");
  ok(!("zoom" in snap) && !("actieveSectie" in snap) && !("resultCombo" in snap), "zoom, actieve sectie en resultaatkeuze blijven scherm, geen project");
  // Onzin wordt genegeerd, het geldige deel niet.
  pasRapportSnapshotToe({ pageSize: "A0", rapportType: "volledig", margeBoven: "veel" });
  const t = useReportStore.getState();
  ok(t.pageSize === "A3" && t.rapportType === "volledig" && t.margeBoven === 22, "ongeldige waarden worden genegeerd, geldige toegepast");
  pasRapportSnapshotToe(undefined);
  ok(useReportStore.getState().rapportType === "volledig", "zonder rapportveld verandert er niets");
}

log("\n4. De poort bij het OPENEN: wat ontbreekt of niet te lezen is (basisaudit ruw 27, 28, 29)");
// Tot september 2026 keek `deserializeProject` alleen naar de kaft van het
// bestand: format-tag, version numeriek, version <= 2. Daarna volgde
// `return parsed as ProjectFile` en verder niets. Gemeten gevolgen:
//   - een bestand zonder `supports`, `loads`, `loadCases` of `nodes` opende
//     ZONDER melding en zette undefined in de store; de app viel pas veel
//     later om, met "Cannot read properties of undefined";
//   - een onbekend top-level veld (de `toelichting` waarmee de
//     referentiebestanden zichzelf documenteren) verdween stil bij het
//     volgende opslaan;
//   - een tikfout in het combinatietype maakte er stil een UGT-combinatie van;
//   - een factor met een decimale KOMMA ("1,5") werd stil NaN.
{
  const kaal = {
    format: "open-fem2d-studio-v2", version: 2, savedAt: "2026-09-16T00:00:00Z",
    nodes: [], beams: [], supports: [], plates: [], loads: [], loadCases: [],
    activeLoadCaseId: 1, selfWeightEnabled: false, nonlinearEnabled: false,
  };
  const weigert = (naam, mutatie, fragment) => {
    const o = JSON.parse(JSON.stringify(kaal));
    mutatie(o);
    let fout = null;
    try { deserializeProject(JSON.stringify(o)); } catch (e) { fout = e; }
    ok(fout !== null && fout.message.includes(fragment), naam,
      fout === null ? "GEEN MELDING - het bestand opende gewoon" : fout.message.slice(0, 120));
  };

  for (const veld of ["nodes", "beams", "supports", "plates", "loads", "loadCases"]) {
    weigert(`zonder \`${veld}\` weigert het openen met een Nederlandse melding`,
      (o) => { delete o[veld]; }, `mist de lijst \`${veld}\``);
  }
  weigert("een lijst die geen array is telt ook niet",
    (o) => { o.loads = {}; }, "mist de lijst `loads`");

  // Het volledige bestand opent gewoon; de poort houdt niets tegen wat de app
  // zelf opslaat. Alle 32 bestanden in de repo dragen deze zes lijsten.
  ok(deserializeProject(JSON.stringify(kaal)).format === "open-fem2d-studio-v2",
    "een compleet bestand opent ongewijzigd");

  // ruw 28 - het analysetype
  weigert("een analysetype dat deze versie niet kent wordt geweigerd",
    (o) => { o.analysetype = "tweedeOrdeToekomst"; o.nonlinearEnabled = true; },
    "tweedeOrdeToekomst");
  for (const t of ["eersteOrde", "tweedeOrdeGeometrisch", "tweedeOrdeFysisch"]) {
    const o = { ...kaal, analysetype: t };
    ok(deserializeProject(JSON.stringify(o)).analysetype === t,
      `analysetype "${t}" gaat gewoon door de poort`);
  }
  ok(deserializeProject(JSON.stringify({ ...kaal, nonlinearEnabled: true })).analysetype === undefined,
    "een bestand van vóór het veld blijft leesbaar (de booleaan telt dan)");

  // ruw 29 - combinatietype en factoren
  weigert("een onbekend combinatietype wordt geweigerd, niet stil UGT",
    (o) => { o.combinations = [{ id: 1, name: "tikfout", type: "als", factors: { 1: 1.35 } }]; },
    'type "als"');
  weigert("een hoofdletterverschil in het type wordt óók geweigerd",
    (o) => { o.combinations = [{ id: 1, name: "SLS", type: "SLS", factors: { 1: 1 } }]; },
    'type "SLS"');
  weigert("een factor met een decimale komma wordt geweigerd, niet stil NaN",
    (o) => { o.combinations = [{ id: 2, name: "UGT", type: "uls", factors: { 1: "1,5" } }]; },
    "decimale KOMMA");
  weigert("een factor die helemaal geen getal is, ook",
    (o) => { o.combinations = [{ id: 2, name: "UGT", type: "uls", factors: { 1: "abc" } }]; },
    "dat is geen getal");
  {
    const goed = combinationsFromFile([
      { id: 1, name: "UGT", type: "uls", factors: { 1: 1.35, 2: "1.5" } },
      { id: 2, name: "BGT", type: "sls", factors: { 1: 1 } },
    ]);
    ok(goed[0].type === "uls" && goed[1].type === "sls", "geldige typen blijven wat ze zijn");
    ok(goed[0].factors.get(1) === 1.35 && goed[0].factors.get(2) === 1.5,
      "een factor met een PUNT blijft gewoon werken (ook als tekst)");
  }

  // ruw 27, tweede helft - onbekende top-level velden
  ok(onbekendeTopVelden({ ...kaal, toelichting: "documentatie van de referentie" })
      .join(",") === "toelichting",
    "een onbekend top-level veld wordt herkend en genoemd");
  ok(onbekendeTopVelden(kaal).length === 0, "een gewoon bestand meldt niets");
  ok(onbekendeTopVelden({ ...kaal, projectInfo: {}, rapport: {}, windInstellingen: {},
      eigenDoorsneden: [], eigenCltOpbouwen: [], idTellers: { belastinggeval: 1, combinatie: 1 },
      structuralGrid: {}, combinatiesVervangenBijOpenen: "x", betonSegmentLengteMm: 400,
      scheefstandBron: "vast", scheefstandHoogteM: null, scheefstandAantalElementen: null,
      scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
      analysetype: "eersteOrde", combinations: [] }).length === 0,
    "alle velden die de app zelf schrijft staan in de bekende lijst");
  // Het bestand met de toelichting opent gewoon: melden, niet blokkeren.
  ok(deserializeProject(JSON.stringify({ ...kaal, toelichting: "x" })).format
      === "open-fem2d-studio-v2",
    "een onbekend veld blokkeert het openen niet");
}

log("");
log(`${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald === 0 ? 0 : 1);
