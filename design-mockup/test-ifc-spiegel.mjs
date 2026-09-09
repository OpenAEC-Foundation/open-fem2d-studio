// Test: de IFC-export is een SPIEGEL van het geopende model.
//
// Waarom deze test bestaat: het IFC-tabblad toonde ooit een vast
// voorbeeldbestand ("Sample Project", verzonnen verdiepingen) in plaats van
// het model dat de gebruiker voor zich had. Deze test legt vast dat het
// bestand — en de boomstructuur die ernaast staat — het AANTAL knopen,
// staven en opleggingen van het model bevat, met de echte projectnaam, en
// dat er geen sjabloontekst in kan terugsluipen.
//
// Stijl: test-ifc-export.mjs. Draaien met: npx tsx test-ifc-spiegel.mjs

const {
  bouwIfcRekenmodel,
  bouwIfcBoom,
  verzamelIfcBeperkingen,
  valideerIfc,
  ifcStatistiek,
} = await import("./src/io/ifcExport.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkTrue(name, cond) {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}`); }
}

function checkEq(name, actual, expected) {
  if (actual === expected) { passed++; log(`  ✓ ${name}: ${actual}`); }
  else { failed++; log(`  ✗ ${name}: ${actual} (verwacht ${expected})`); }
}

/** Tel entiteiten van exact dit type (hele regels "#n=NAAM("). */
function tel(ifc, entiteit) {
  const re = new RegExp(`^#\\d+=${entiteit}\\(`, "gm");
  return (ifc.match(re) ?? []).length;
}

/** Alle knopen in een boom, plat. */
function platteBoom(knoop, uit = []) {
  uit.push(knoop);
  for (const k of knoop.kinderen ?? []) platteBoom(k, uit);
  return uit;
}

// ─────────────────────────────────────────────────────────────────────────
// Verzonnen model: portaal met een tussensteunpunt en een luifel —
// 8 knopen, 5 staven, 4 opleggingen, 2 belastinggevallen.
// ─────────────────────────────────────────────────────────────────────────
const model = {
  project: {
    naam: "Loods Noord",
    projectnummer: "PRJ-2026-014",
    ingenieur: "T. Voorbeeld",
    bedrijf: "Voorbeeld Constructieadvies",
    locatie: "Kavel 7",
    omschrijving: "Portaal met luifel, hoofddraagconstructie",
  },
  nodes: [
    { id: 1, x: 0,     z: 0 },
    { id: 2, x: 0,     z: 4000 },
    { id: 3, x: 6000,  z: 5000 },
    { id: 4, x: 12000, z: 4000 },
    { id: 5, x: 12000, z: 0 },
    { id: 6, x: 6000,  z: 0 },
    { id: 7, x: 15000, z: 3500 },
    { id: 8, x: 15000, z: 0 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: "S235", profile: "HEA140" },
    { id: 2, from: 2, to: 3, material: "S235", profile: "IPE200" },
    { id: 3, from: 3, to: 4, material: "S235", profile: "IPE200" },
    { id: 4, from: 4, to: 5, material: "S235", profile: "HEA140" },
    { id: 5, from: 4, to: 7, material: "S235", profile: "SHS 60x60x4" },
  ],
  supports: [
    { nodeId: 1, type: "pinned" },
    { nodeId: 5, type: "pinned" },
    { nodeId: 6, type: "zRoller" },
    { nodeId: 8, type: "xRoller" },
  ],
  loads: [
    { id: 1, type: "lineLoad",   caseId: 1, beamId: 2, q: -4.5, qDir: "z" },
    { id: 2, type: "lineLoad",   caseId: 1, beamId: 3, q: -4.5, qDir: "z" },
    { id: 3, type: "pointForce", caseId: 2, nodeId: 7, fz: -12 },
  ],
  loadCases: [
    { id: 1, name: "Permanent", type: "dead" },
    { id: 2, name: "Sneeuw",    type: "snow" },
  ],
};

log("\n[1] Portaal met luifel — het bestand spiegelt het model");
const ifc = bouwIfcRekenmodel(model);

log("  — (a) aantallen komen uit het model, niet uit een sjabloon");
checkEq("knopen → IfcStructuralPointConnection",
  tel(ifc, "IFCSTRUCTURALPOINTCONNECTION"), model.nodes.length);
checkEq("staven → IfcStructuralCurveMember",
  tel(ifc, "IFCSTRUCTURALCURVEMEMBER"), model.beams.length);
// Opleggingen zijn IfcBoundaryNodeCondition; scharnieren (releases) zouden
// dat óók zijn, vandaar de naamfilter — dit model heeft er geen.
const opleggingen = (ifc.match(/^#\d+=IFCBOUNDARYNODECONDITION\('(?!Scharnier')/gm) ?? []).length;
checkEq("opleggingen → IfcBoundaryNodeCondition", opleggingen, model.supports.length);
checkEq("belastinggevallen → IfcStructuralLoadGroup",
  tel(ifc, "IFCSTRUCTURALLOADGROUP"), model.loadCases.length);
checkEq("belastingen → IfcRelConnectsStructuralActivity",
  tel(ifc, "IFCRELCONNECTSSTRUCTURALACTIVITY"), model.loads.length);
checkEq("staafeinden → IfcRelConnectsStructuralMember",
  tel(ifc, "IFCRELCONNECTSSTRUCTURALMEMBER"), model.beams.length * 2);

log("  — (b) geen sjabloonresten");
for (const sjabloon of [
  "Sample Project", "Default Site", "Default Building",
  "Ground Floor", "First Floor", "OpenAEC Template", "sample.ifc",
]) {
  checkTrue(`bevat "${sjabloon}" niet`, !ifc.includes(sjabloon));
}
checkEq("geen IfcBuildingStorey (dit model heeft geen verdiepingen)",
  tel(ifc, "IFCBUILDINGSTOREY"), 0);

log("  — (c) elke knoop staat er met zijn eigen coördinaat in");
for (const n of model.nodes) {
  const punt = `IFCCARTESIANPOINT((${(n.x / 1000).toString().includes(".") ? n.x / 1000 : `${n.x / 1000}.`},0.,` +
    `${(n.z / 1000).toString().includes(".") ? n.z / 1000 : `${n.z / 1000}.`}))`;
  checkTrue(`knoop ${n.id} → ${punt}`, ifc.includes(punt));
}

log("  — (d) elke staaf draagt zijn materiaal en profiel");
for (const b of model.beams) {
  checkTrue(`staaf ${b.id} → '${b.material} ${b.profile}'`,
    ifc.includes(`'Staaf ${b.id}','${b.material} ${b.profile}'`));
}
checkTrue("IPE200 als parametrisch I-profiel",
  ifc.includes("IFCISHAPEPROFILEDEF(.AREA.,'IPE200',$,0.1,0.2,"));
checkTrue("HEA140 als parametrisch I-profiel",
  ifc.includes("IFCISHAPEPROFILEDEF(.AREA.,'HEA140',$,0.14,0.133,"));
checkTrue("SHS 60x60x4 als koker met wanddikte 4 mm en hoekstraal 6 mm",
  ifc.includes("IFCRECTANGLEHOLLOWPROFILEDEF(.AREA.,'SHS 60x60x4',$,0.06,0.06,0.004,$,0.006)"));

log("  — (e) belastinggevallen dragen hun eigen naam");
checkTrue("belastinggeval 'Permanent' met PERMANENT_G",
  /IFCSTRUCTURALLOADGROUP\('[^']+',\$,'Permanent',\$,\$,\.LOAD_CASE\.,\.PERMANENT_G\./.test(ifc));
checkTrue("belastinggeval 'Sneeuw' met SNOW_S",
  /IFCSTRUCTURALLOADGROUP\('[^']+',\$,'Sneeuw',\$,\$,\.LOAD_CASE\.,\.VARIABLE_Q\.,\.SNOW_S\./.test(ifc));

log("  — (f) projectgegevens uit de projectinstellingen");
checkTrue("IfcProject.Name = projectnaam",
  ifc.includes("'Loods Noord'"));
checkTrue("IfcProject.Description = omschrijving",
  ifc.includes("'Portaal met luifel, hoofddraagconstructie'"));
checkTrue("IfcProject.LongName = projectnummer",
  ifc.includes("'PRJ-2026-014'"));
checkTrue("IfcSite.Name = locatie", ifc.includes("IFCSITE('") && ifc.includes("'Kavel 7'"));
checkTrue("ingenieur in de STEP-header",
  /FILE_NAME\([^\n]*\('T\. Voorbeeld'\),\('Voorbeeld Constructieadvies'\)/.test(ifc));
checkTrue("bestandsnaam in de header is de projectnaam",
  ifc.includes("FILE_NAME('Loods Noord.ifc'"));

log("  — (g) het bestand is geldig IFC4");
const uitslag = valideerIfc(ifc);
if (uitslag.fouten.length > 0) log("    fouten: " + uitslag.fouten.join(" | "));
checkEq("validatie: geen fouten", uitslag.fouten.length, 0);
checkEq("validatie: geen waarschuwingen", uitslag.waarschuwingen.length, 0);
checkTrue("validatie telt entiteiten", uitslag.entiteiten > 50);
checkTrue("statistiek noemt IfcCartesianPoint",
  ifcStatistiek(ifc).some(s => s.type === "IFCCARTESIANPOINT"));

log("  — (h) de enige kanttekening is dat er niet getoetst is");
// Het model zelf past volledig in het bestand. Wat er NIET in staat is de
// toetsuitslag, en dat is geen vorm-beperking van IFC maar een lege hand:
// dit model is niet getoetst. Dat hoort de gebruiker te zien voordat hij het
// bestand overhandigt, dus het staat in de lijst.
const kanttekeningen = verzamelIfcBeperkingen(model);
checkEq("precies een kanttekening", kanttekeningen.length, 1);
checkTrue("en die gaat over de ontbrekende toetsresultaten",
  /Geen toetsresultaten/.test(kanttekeningen[0]));

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De boomstructuur toont hetzelfde model als het bestand");
const boom = bouwIfcBoom(model);
const plat = platteBoom(boom);

checkEq("wortel = IfcProject", boom.type, "IfcProject");
checkEq("wortelnaam = projectnaam", boom.naam, "Loods Noord");
const knopenTak = plat.find(k => k.type === "IfcStructuralPointConnection");
const stavenTak = plat.find(k => k.type === "IfcStructuralCurveMember");
const steunTak  = plat.find(k => k.naam === "Opleggingen");
checkEq("tak Knopen telt het echte aantal", knopenTak?.aantal, model.nodes.length);
checkEq("tak Knopen heeft evenveel kinderen", knopenTak?.kinderen?.length, model.nodes.length);
checkEq("tak Staven telt het echte aantal", stavenTak?.aantal, model.beams.length);
checkEq("tak Staven heeft evenveel kinderen", stavenTak?.kinderen?.length, model.beams.length);
checkEq("tak Opleggingen telt het echte aantal", steunTak?.aantal, model.supports.length);
const gevallen = plat.filter(k => k.type === "IfcStructuralLoadGroup");
checkEq("één tak per belastinggeval", gevallen.length, model.loadCases.length);
checkTrue("belastinggevallen heten Permanent en Sneeuw",
  gevallen.map(g => g.naam).join("|") === "Permanent|Sneeuw");
checkEq("terreinknoop draagt de locatie",
  plat.find(k => k.type === "IfcSite")?.naam, "Kavel 7");
const boomTekst = plat.map(k => `${k.type} ${k.naam}`).join("\n");
checkTrue("geen verzonnen verdiepingen in de boom",
  !/Ground Floor|First Floor|Default Site|Sample Project/.test(boomTekst));
checkTrue("knoop 3 staat met zijn coördinaat in de boom",
  boomTekst.includes("Knoop 3 — x 6,000 m, z 5,000 m"));

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Export structureel — draagsysteem zonder belastingen");
const structureel = bouwIfcRekenmodel(model, { zonderLasten: true });
checkEq("knopen blijven", tel(structureel, "IFCSTRUCTURALPOINTCONNECTION"), model.nodes.length);
checkEq("staven blijven", tel(structureel, "IFCSTRUCTURALCURVEMEMBER"), model.beams.length);
checkEq("opleggingen blijven",
  (structureel.match(/^#\d+=IFCBOUNDARYNODECONDITION\(/gm) ?? []).length, model.supports.length);
checkEq("geen belastinggroepen", tel(structureel, "IFCSTRUCTURALLOADGROUP"), 0);
checkEq("geen lijnlasten", tel(structureel, "IFCSTRUCTURALLINEARACTION"), 0);
checkEq("geen puntlasten", tel(structureel, "IFCSTRUCTURALPOINTACTION"), 0);
checkEq("validatie: geen fouten",
  valideerIfc(structureel).fouten.length, 0);
const structBeperking = verzamelIfcBeperkingen(model, { zonderLasten: true });
checkEq("twee punten gemeld: de lasten en de ontbrekende toetsing",
  structBeperking.length, 2);
checkTrue("melding noemt de aantallen",
  structBeperking[0].includes("3 belastingen") && structBeperking[0].includes("2 belastinggevallen"));
checkTrue("de tweede melding gaat over de toetsing",
  /Geen toetsresultaten/.test(structBeperking[1]));

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Wat niet in IFC past, wordt gemeld (niet stil weggelaten)");
const metPlaten = {
  ...model,
  beams: [...model.beams, { id: 9, from: 1, to: 5, material: "S235", profile: "XYZ-onbekend" }],
  plates: [{ id: 1 }, { id: 2 }],
  eigenGewicht: true,
  aantalCombinaties: 4,
  loads: [...model.loads, { id: 4, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: -3 }],
};
const beperkingen = verzamelIfcBeperkingen(metPlaten);
const alleRegels = beperkingen.join("\n");
checkTrue("platen worden gemeld", /2 platen/.test(alleRegels));
checkTrue("randbelasting op een plaat wordt gemeld", /randbelasting/.test(alleRegels));
checkTrue("eigen gewicht wordt gemeld", /Eigen gewicht/.test(alleRegels));
checkTrue("combinaties worden gemeld", /4 belastingcombinaties/.test(alleRegels));
checkTrue("onbekende doorsnede wordt gemeld", /XYZ-onbekend/.test(alleRegels));
checkTrue("en dat die staaf ook geen bouwkundig element krijgt",
  /geen IfcBeam of IfcColumn/.test(alleRegels));
checkTrue("ontbrekende toetsresultaten worden gemeld",
  /Geen toetsresultaten/.test(alleRegels));
checkEq("zes punten gemeld", beperkingen.length, 6);

const kapotModel = {
  ...model,
  beams: [...model.beams, { id: 9, from: 1, to: 99, material: "S235", profile: "IPE200" }],
  loads: [...model.loads, { id: 5, type: "pointForce", caseId: 1, nodeId: 77, fz: -2 }],
};
const kapotRegels = verzamelIfcBeperkingen(kapotModel).join("\n");
checkTrue("staaf naar een niet-bestaande knoop wordt gemeld",
  /staaf\/staven verwijzen naar een knoop die niet bestaat/.test(kapotRegels));
checkTrue("last naar een niet-bestaande knoop wordt gemeld",
  /belasting\(en\) verwijzen naar een knoop of staaf die niet bestaat/.test(kapotRegels));

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Deellast, lokale lijnlast en staafgebonden puntlast");
const lastModel = {
  projectNaam: "Lasten",
  nodes: [
    { id: 1, x: 0,     z: 0 },
    { id: 2, x: 10000, z: 0 },
    { id: 3, x: 0,     z: 4000 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: "S235", profile: "IPE300" },
    { id: 2, from: 1, to: 3, material: "S235", profile: "HEA200" },
  ],
  supports: [
    { nodeId: 1, type: "fixed" },
    { nodeId: 2, type: "zRoller" },
  ],
  loads: [
    // Deellast van 2 m tot 6 m op een staaf van 10 m.
    { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -5, qDir: "z",
      startFrac: 0.2, endFrac: 0.6 },
    // Lokale, staafloodrechte last op de verticale staaf 1→3.
    { id: 2, type: "lineLoad", caseId: 1, beamId: 2, q: 3, qDir: "z", qCoord: "local" },
    // Puntlast op 25% van de horizontale staaf → x = 2,5 m.
    { id: 3, type: "pointForce", caseId: 1, beamId: 1, posFrac: 0.25, fz: -8 },
  ],
  loadCases: [{ id: 1, name: "Veranderlijk", type: "live" }],
};
const ifcLasten = bouwIfcRekenmodel(lastModel);

checkTrue("deellast → IfcStructuralCurveAction met POLYGONAL",
  ifcLasten.includes(".POLYGONAL."));
checkTrue("deellast: knikpunten op 0, 2, 6 en 10 m",
  ifcLasten.includes("((0.),(2.),(6.),(10.))"));
checkTrue("deellast: nul buiten het belaste deel, -5000 N/m erbinnen",
  ifcLasten.includes("IFCSTRUCTURALLOADLINEARFORCE('q 1 nul',$,$,IFCLINEARFORCEMEASURE(0.),$,$,$)") &&
  ifcLasten.includes("IFCSTRUCTURALLOADLINEARFORCE('q 1 begin',$,$,IFCLINEARFORCEMEASURE(-5000.)"));
checkTrue("lokale last op een verticale staaf → globale X-component -3000 N/m",
  ifcLasten.includes("IFCSTRUCTURALLOADLINEARFORCE('q 2',IFCLINEARFORCEMEASURE(-3000.),$,$,$,$,$)"));
checkTrue("alles staat in wereldassen (geen LOCAL_COORDS voor lijnlasten)",
  !/IFCSTRUCTURALLINEARACTION\([^\n]*\.LOCAL_COORDS\./.test(ifcLasten));
checkTrue("staafgebonden puntlast krijgt een eigen punt op 2,5 m",
  ifcLasten.includes("IFCCARTESIANPOINT((2.5,0.,0.))"));
checkTrue("staafgebonden puntlast draagt -8 kN",
  ifcLasten.includes("IFCFORCEMEASURE(-8000.)"));
checkEq("alle drie de lasten zijn gekoppeld",
  tel(ifcLasten, "IFCRELCONNECTSSTRUCTURALACTIVITY"), 3);
checkEq("validatie: geen fouten", valideerIfc(ifcLasten).fouten.length, 0);
const lastBeperking = verzamelIfcBeperkingen(lastModel);
checkEq("de lasten passen alle drie in het bestand", lastBeperking.length, 1);
checkTrue("de enige melding gaat over de ontbrekende toetsing",
  /Geen toetsresultaten/.test(lastBeperking[0]));

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] De validator vindt een kapot bestand ook echt kapot");
checkTrue("dangling verwijzing wordt gevonden",
  valideerIfc(ifc.replace(/#3\b/, "#99999")).fouten.some(f => /niet-bestaande entiteit/.test(f)));
checkTrue("ontbrekend schema wordt gevonden",
  valideerIfc(ifc.replace("FILE_SCHEMA(('IFC4'));", "FILE_SCHEMA(('IFC2X3'));"))
    .fouten.some(f => /IFC4-schema/.test(f)));
checkTrue("afgekapte staart wordt gevonden",
  valideerIfc(ifc.replace("END-ISO-10303-21;", "")).fouten.length > 0);
const leeg = bouwIfcRekenmodel({
  projectNaam: "Leeg", nodes: [], beams: [], supports: [], loads: [], loadCases: [],
});
checkEq("leeg model: nog steeds geldig IFC4", valideerIfc(leeg).fouten.length, 0);
checkEq("leeg model: drie waarschuwingen", valideerIfc(leeg).waarschuwingen.length, 3);

// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Het bouwkundige model spiegelt hetzelfde model");

// Elke staaf van het portaal met luifel heeft een bekend profiel, dus elke
// staaf hoort ook als bouwkundig element in het bestand te staan — als ligger
// of als kolom, zonder dat er eentje wegvalt of dubbel komt.
const liggers = tel(ifc, "IFCBEAM");
const kolommen = tel(ifc, "IFCCOLUMN");
checkEq("elke staaf krijgt een ligger of een kolom",
  liggers + kolommen, model.beams.length);
// Staaf 1 (0,0)→(0,4000) en staaf 4 (12000,4000)→(12000,0) staan verticaal.
checkEq("de twee verticale staven zijn kolommen", kolommen, 2);
checkEq("elke rekenstaaf wijst naar zijn bouwkundige element",
  tel(ifc, "IFCRELASSIGNSTOPRODUCT"), model.beams.length);
checkEq("alle elementen zitten in één gebouwcontainment",
  tel(ifc, "IFCRELCONTAINEDINSPATIALSTRUCTURE"), 1);
checkEq("één geëxtrudeerd lichaam per element",
  tel(ifc, "IFCEXTRUDEDAREASOLID"), model.beams.length);
checkEq("één hoeveelhedenset per element",
  tel(ifc, "IFCELEMENTQUANTITY"), model.beams.length);
// Drie eigen sets per staaf (doorsnede, staaf) plus de gemeenschappelijke set
// per element; er is niet getoetst, dus OpenFEM2D_Toetsing ontbreekt.
checkEq("geen toetsingsset zonder toetsuitslag",
  (ifc.match(/'OpenFEM2D_Toetsing'/g) ?? []).length, 0);
checkEq("een doorsnedeset per staaf",
  (ifc.match(/'OpenFEM2D_Doorsnede'/g) ?? []).length, model.beams.length);

log("  — de boom toont de bouwkundige staven ernaast");
const platB = platteBoom(bouwIfcBoom(model));
const bouwTak = platB.find(k => k.naam === "Bouwkundige staven");
checkEq("tak 'Bouwkundige staven' telt het echte aantal",
  bouwTak?.aantal, model.beams.length);
const elementTeksten = (bouwTak?.kinderen ?? []).map(k => `${k.type} ${k.naam}`);
checkTrue("staaf 5 (de luifel) staat er als ligger met zijn koker",
  elementTeksten.some(t => t.startsWith("IfcBeam Ligger 5") && t.includes("SHS 60x60x4")));
checkTrue("staaf 1 staat er als kolom",
  elementTeksten.some(t => t.startsWith("IfcColumn Kolom 1")));
checkEq("zonder bouwkundig model verdwijnt de tak uit de boom",
  platteBoom(bouwIfcBoom(model, { zonderBouwkundig: true }))
    .filter(k => k.naam === "Bouwkundige staven").length, 0);

log("  — een betonstaaf met korf toont zijn wapening");
const betonModel = {
  projectNaam: "Betonligger",
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
  beams: [{
    id: 1, from: 1, to: 2, material: "C30/37", profile: "300x500",
    checkConfig: {
      betonStaalsoort: "B500B",
      betonKorf: {
        cover_mm: 30, stirrup_diameter_mm: 8,
        bottom: { count: 3, diameter_mm: 16 },
        top: { count: 2, diameter_mm: 12 },
        stirrup_spacing_mm: 200, stirrup_legs: 2,
      },
    },
  }],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  loads: [], loadCases: [],
};
const wapeningTak = platteBoom(bouwIfcBoom(betonModel))
  .find(k => k.type === "IfcReinforcingBar");
checkTrue("de korf staat onder de ligger in de boom",
  wapeningTak !== undefined && /onder 3/.test(wapeningTak.naam) &&
  /boven 2/.test(wapeningTak.naam) && /beugel/.test(wapeningTak.naam));
const betonIfc = bouwIfcRekenmodel(betonModel);
checkEq("het bestand draagt zes wapeningsstaven",
  tel(betonIfc, "IFCREINFORCINGBAR"), 6);
checkEq("validatie: geen fouten", valideerIfc(betonIfc).fouten.length, 0);
checkEq("validatie: geen waarschuwingen", valideerIfc(betonIfc).waarschuwingen.length, 0);
const betonRegels = verzamelIfcBeperkingen(betonModel).join("\n");
checkTrue("de samengevatte beugelreeks wordt eerlijk gemeld",
  /Beugels van 1 betonstaaf/.test(betonRegels));

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald\n`);
process.exit(failed === 0 ? 0 : 1);
