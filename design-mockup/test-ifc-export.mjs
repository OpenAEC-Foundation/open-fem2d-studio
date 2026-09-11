// Test IFC4-export van het rekenmodel (src/io/ifcExport.ts).
// Verifieert de SPF-omlijsting, entiteit-aantallen, referentie-integriteit,
// eenheidsconversies (mm → m, kN → N), GlobalId's en determinisme.
//
// Stijl: test-veldzakking.mjs. Draaien met: npx tsx test-ifc-export.mjs

const {
  bouwIfcRekenmodel, valideerIfc, verzamelIfcBeperkingen, GEWORTELDE_ENTITEITEN,
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

/** Elke #id-referentie in argumenten moet naar een bestaande entiteit wijzen. */
function refIntegriteit(ifc) {
  const gedefinieerd = new Set();
  for (const m of ifc.matchAll(/^#(\d+)=/gm)) gedefinieerd.add(m[1]);
  const kapot = [];
  for (const regel of ifc.split("\n")) {
    const eq = regel.indexOf("=");
    if (!regel.startsWith("#") || eq < 0) continue;
    const args = regel.slice(eq + 1);
    for (const m of args.matchAll(/#(\d+)/g)) {
      if (!gedefinieerd.has(m[1])) kapot.push(`${regel.slice(0, eq)} → #${m[1]}`);
    }
  }
  return kapot;
}

/**
 * GlobalId's: eerste attribuut van de GEWORTELDE entiteiten, 22 tekens
 * IFC-base64.
 *
 * De entiteitsnamen komen uit de export zelf (`GEWORTELDE_ENTITEITEN`) en
 * niet uit een patroon "eerste attribuut is een string van 22 tekens". Dat
 * patroon telde ook gewone namen mee: een eigenschap die toevallig 22 tekens
 * lang heet ("Torsietraagheidsmoment") kwam er drie keer in en zag eruit als
 * een dubbele GlobalId, terwijl geen enkele GUID dubbel was.
 */
function globalIds(ifc) {
  // Met tekenklassen ([0-9], [(]) in plaats van escapes: dan staat er in de
  // bron precies wat de RegExp ziet, zonder verdubbelde backslashes.
  const re = new RegExp(
    "^#[0-9]+=(?:" + GEWORTELDE_ENTITEITEN.join("|") + ")[(]'([^']*)'", "gm");
  return [...ifc.matchAll(re)].map(m => m[1]);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: standaardportaal — 4 knopen, 3 staven, 2 scharnieropleggingen,
//         1 lijnlast (10 kN/m ↓ op de ligger)
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Standaardportaal 12 m × 5 m");
const portaal = {
  projectNaam: "Testportaal",
  nodes: [
    { id: 1, x: 0,     z: 0 },
    { id: 2, x: 0,     z: 5000 },
    { id: 3, x: 12000, z: 5000 },
    { id: 4, x: 12000, z: 0 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: "S235", profile: "HEB300" },
    { id: 2, from: 2, to: 3, material: "S235", profile: "IPE400" },
    { id: 3, from: 3, to: 4, material: "S235", profile: "HEB300" },
  ],
  supports: [
    { nodeId: 1, type: "pinned" },
    { nodeId: 4, type: "pinned" },
  ],
  loads: [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 2, q: -10, qDir: "z" },
  ],
  loadCases: [{ id: 1, name: "Permanent", type: "dead" }],
};

const ifc = bouwIfcRekenmodel(portaal);

log("  — (a) SPF-omlijsting");
checkTrue("begint met ISO-10303-21;", ifc.startsWith("ISO-10303-21;"));
checkTrue("HEADER-sectie aanwezig", ifc.includes("\nHEADER;\n"));
checkTrue("FILE_SCHEMA(('IFC4'))", ifc.includes("FILE_SCHEMA(('IFC4'));"));
checkTrue("FILE_DESCRIPTION met StructuralAnalysisView", ifc.includes("StructuralAnalysisView"));
checkTrue("DATA-sectie aanwezig", ifc.includes("\nDATA;\n"));
checkTrue("eindigt met END-ISO-10303-21;", ifc.trimEnd().endsWith("END-ISO-10303-21;"));

log("  — (b) entiteit-aantallen");
checkEq("4× IfcStructuralPointConnection", tel(ifc, "IFCSTRUCTURALPOINTCONNECTION"), 4);
checkEq("3× IfcStructuralCurveMember", tel(ifc, "IFCSTRUCTURALCURVEMEMBER"), 3);
checkEq("1× IfcStructuralLinearAction", tel(ifc, "IFCSTRUCTURALLINEARACTION"), 1);
checkEq("1× IfcStructuralAnalysisModel", tel(ifc, "IFCSTRUCTURALANALYSISMODEL"), 1);
checkEq("1× IfcStructuralLoadGroup", tel(ifc, "IFCSTRUCTURALLOADGROUP"), 1);
const vasteXZ = (ifc.match(
  /^#\d+=IFCBOUNDARYNODECONDITION\([^,]+,IFCBOOLEAN\(\.T\.\),\$,IFCBOOLEAN\(\.T\.\)/gm,
) ?? []).length;
checkEq("2× IfcBoundaryNodeCondition met vaste X/Z", vasteXZ, 2);
checkEq("6× IfcRelConnectsStructuralMember (2 per staaf)",
  tel(ifc, "IFCRELCONNECTSSTRUCTURALMEMBER"), 6);
checkTrue("model is IN_PLANE_LOADING_2D", ifc.includes(".IN_PLANE_LOADING_2D."));

log("  — (c) referentie-integriteit");
const kapot = refIntegriteit(ifc);
checkEq("geen dangling #-referenties", kapot.length, 0);
if (kapot.length > 0) log("    kapot: " + kapot.slice(0, 5).join(", "));

log("  — (d) coördinaten in meters");
checkTrue("knoop (12000, 5000) mm → (12.,0.,5.)", ifc.includes("IFCCARTESIANPOINT((12.,0.,5.))"));
checkTrue("knoop (0, 5000) mm → (0.,0.,5.)", ifc.includes("IFCCARTESIANPOINT((0.,0.,5.))"));
checkTrue("lijnlast -10 kN/m → -10000. N/m", ifc.includes("IFCLINEARFORCEMEASURE(-10000.)"));
checkTrue("IPE400-profiel in meters (b=0.18, h=0.4)",
  ifc.includes("IFCISHAPEPROFILEDEF(.AREA.,'IPE400',$,0.18,0.4,"));

log("  — (e) GlobalId's");
const ids = globalIds(ifc);
checkTrue(`GlobalId's aanwezig (${ids.length})`, ids.length >= 15);
checkEq("alle GlobalId's uniek", new Set(ids).size, ids.length);
checkTrue("alle 22 tekens", ids.every(g => g.length === 22));

log("  — (f) determinisme");
checkTrue("twee keer exporteren = identieke string", bouwIfcRekenmodel(portaal) === ifc);
checkTrue("geen 'undefined'/'NaN' in uitvoer", !ifc.includes("undefined") && !ifc.includes("NaN"));

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: kenmerkenmodel — veren, releases, puntlasten, moment, trapezium,
//         horizontale lijnlast, thermische last, hout + onbekend profiel
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Kenmerkenmodel (veren, scharnieren, lasttypes, hout)");
const model2 = {
  projectNaam: "Kenmerkenmodel",
  nodes: [
    { id: 1, x: 0,     z: 0 },
    { id: 2, x: 6000,  z: 0 },
    { id: 3, x: 12000, z: 0 },
    { id: 4, x: 12000, z: 3000 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: "C24",  profile: "60x120" },
    { id: 2, from: 2, to: 3, material: "S355", profile: "HEA160",
      releases: { startRy: true, endRy: true } },
    { id: 3, from: 3, to: 4, material: "S235", profile: "ONBEKEND-99" },
  ],
  supports: [
    { nodeId: 1, type: "zSpring", k: 50 },     // 50 kN/mm → 5e7 N/m
    { nodeId: 2, type: "rotSpring", k: 2000 }, // 2000 kNm/rad → 2e6 N·m/rad
    { nodeId: 3, type: "fixed" },
    { nodeId: 4, type: "xRoller" },
  ],
  loads: [
    { id: 1, type: "pointForce",  caseId: 1, nodeId: 4, fx: 5, fz: -12 },
    { id: 2, type: "pointMoment", caseId: 1, nodeId: 2, my: 3.5 },
    { id: 3, type: "lineLoad",    caseId: 2, beamId: 1, qStart: -2, qEnd: -8, qDir: "z" },
    { id: 4, type: "lineLoad",    caseId: 2, beamId: 2, q: -4, qDir: "x" },
    { id: 5, type: "thermal",     caseId: 3, beamId: 2, deltaT: 25 },
  ],
  loadCases: [
    { id: 1, name: "Permanent", type: "dead" },
    { id: 2, name: "Wind",      type: "wind" },
    { id: 3, name: "Thermisch", type: "other" },
  ],
};

const ifc2 = bouwIfcRekenmodel(model2);

log("  — opleggingen en veren");
checkTrue("zSpring 50 kN/mm → IFCLINEARSTIFFNESSMEASURE(50000000.)",
  ifc2.includes("IFCLINEARSTIFFNESSMEASURE(50000000.)"));
checkTrue("rotSpring 2000 kNm/rad → IFCROTATIONALSTIFFNESSMEASURE(2000000.)",
  ifc2.includes("IFCROTATIONALSTIFFNESSMEASURE(2000000.)"));
const inklemming = (ifc2.match(
  /^#\d+=IFCBOUNDARYNODECONDITION\([^,]+,IFCBOOLEAN\(\.T\.\),\$,IFCBOOLEAN\(\.T\.\),\$,IFCBOOLEAN\(\.T\.\)/gm,
) ?? []).length;
checkEq("1× volledige inklemming (X/Z/RY vast)", inklemming, 1);

log("  — scharnieren (releases)");
checkTrue("staaf met Ry-release aan beide einden = PIN_JOINED_MEMBER",
  ifc2.includes(".PIN_JOINED_MEMBER."));
const scharnieren = (ifc2.match(
  /^#\d+=IFCBOUNDARYNODECONDITION\('Scharnier',IFCBOOLEAN\(\.T\.\),\$,IFCBOOLEAN\(\.T\.\),\$,IFCBOOLEAN\(\.F\.\)/gm,
) ?? []).length;
checkEq("2× expliciete scharnier-eindvoorwaarde", scharnieren, 2);

log("  — profielen en materialen");
checkTrue("hout 60x120 → IFCRECTANGLEPROFILEDEF(.AREA.,'60x120',$,0.06,0.12)",
  ifc2.includes("IFCRECTANGLEPROFILEDEF(.AREA.,'60x120',$,0.06,0.12)"));
checkTrue("HEA160 → IFCISHAPEPROFILEDEF(.AREA.,'HEA160',$,0.16,0.152,0.006,0.009,0.015,$,$)",
  ifc2.includes("IFCISHAPEPROFILEDEF(.AREA.,'HEA160',$,0.16,0.152,0.006,0.009,0.015,$,$)"));
checkTrue("materialen C24/S355/S235 aanwezig",
  ifc2.includes("IFCMATERIAL('C24'") && ifc2.includes("IFCMATERIAL('S355'") &&
  ifc2.includes("IFCMATERIAL('S235'"));
checkTrue("onbekend profiel: geen profieldefinitie, wel materiaalkoppeling",
  !ifc2.includes("'ONBEKEND-99',$") &&
  tel(ifc2, "IFCRELASSOCIATESMATERIAL") === 3);

log("  — lasten");
checkTrue("puntlast fx=5 kN → IFCFORCEMEASURE(5000.)", ifc2.includes("IFCFORCEMEASURE(5000.)"));
checkTrue("puntlast fz=-12 kN → IFCFORCEMEASURE(-12000.)", ifc2.includes("IFCFORCEMEASURE(-12000.)"));
checkTrue("moment 3.5 kNm → IFCTORQUEMEASURE(3500.)", ifc2.includes("IFCTORQUEMEASURE(3500.)"));
checkEq("2× IfcStructuralPointAction", tel(ifc2, "IFCSTRUCTURALPOINTACTION"), 2);
checkTrue("trapezium → IfcStructuralCurveAction met .LINEAR.",
  tel(ifc2, "IFCSTRUCTURALCURVEACTION") === 1 && ifc2.includes(".LINEAR."));
checkTrue("trapeziumwaarden -2/-8 kN/m → -2000./-8000. N/m",
  ifc2.includes("IFCLINEARFORCEMEASURE(-2000.)") && ifc2.includes("IFCLINEARFORCEMEASURE(-8000.)"));
checkTrue("trapezium-lastconfiguratie over 0..6 m",
  ifc2.includes("((0.),(6.))") && tel(ifc2, "IFCSTRUCTURALLOADCONFIGURATION") === 1);
checkTrue("horizontale lijnlast (qDir=x) → LinearForceX gevuld",
  /IFCSTRUCTURALLOADLINEARFORCE\('q 4',IFCLINEARFORCEMEASURE\(-4000\.\),\$,\$/.test(ifc2));
checkTrue("thermische last → IFCSTRUCTURALLOADTEMPERATURE met 25 K",
  ifc2.includes("IFCTHERMODYNAMICTEMPERATUREMEASURE(25.)"));
checkEq("3× IfcStructuralLoadGroup (3 belastinggevallen)", tel(ifc2, "IFCSTRUCTURALLOADGROUP"), 3);
checkEq("5× IfcRelConnectsStructuralActivity", tel(ifc2, "IFCRELCONNECTSSTRUCTURALACTIVITY"), 5);

log("  — integriteit en determinisme");
const kapot2 = refIntegriteit(ifc2);
checkEq("geen dangling #-referenties", kapot2.length, 0);
const ids2 = globalIds(ifc2);
checkEq("alle GlobalId's uniek", new Set(ids2).size, ids2.length);
checkTrue("determinisme (2e export identiek)", bouwIfcRekenmodel(model2) === ifc2);
checkTrue("GlobalId's onafhankelijk per entiteit (model 1 ≠ model 2 waar inhoud verschilt)",
  ids2.length !== ids.length || ids2.join() !== ids.join());

// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// TEST 3: STEP-syntaxis — elk attribuut aanwezig, geen gat in de rij
//
// De grootste stille fout die een SPF-schrijver kan maken is een attribuut
// OVERSLAAN. Het bestand blijft dan leesbaar, maar alle volgende attributen
// schuiven een plaats op en de lezer krijgt de verkeerde waarde te zien
// zonder dat iets meldt dat er iets mis is. Deze tabel legt per entiteit vast
// hoeveel attributen IFC4 er voorschrijft.
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] STEP-syntaxis: het aantal attributen per entiteit");

/** Aantal attributen per IFC4-entiteit die deze export schrijft. */
const ATTRIBUTEN = {
  IFCSIUNIT: 4, IFCUNITASSIGNMENT: 1,
  IFCCARTESIANPOINT: 1, IFCDIRECTION: 1,
  IFCAXIS2PLACEMENT3D: 3, IFCLOCALPLACEMENT: 2,
  IFCGEOMETRICREPRESENTATIONCONTEXT: 6, IFCGEOMETRICREPRESENTATIONSUBCONTEXT: 10,
  IFCPROJECT: 9, IFCSITE: 14, IFCBUILDING: 12,
  IFCRELAGGREGATES: 6, IFCRELSERVICESBUILDINGS: 6,
  IFCSTRUCTURALLOADGROUP: 10, IFCSTRUCTURALANALYSISMODEL: 10,
  IFCVERTEXPOINT: 1, IFCTOPOLOGYREPRESENTATION: 4, IFCEDGE: 2,
  IFCPRODUCTDEFINITIONSHAPE: 3, IFCSHAPEREPRESENTATION: 4,
  IFCSTRUCTURALPOINTCONNECTION: 9, IFCBOUNDARYNODECONDITION: 7,
  IFCSTRUCTURALCURVEMEMBER: 9, IFCRELCONNECTSSTRUCTURALMEMBER: 10,
  IFCMATERIAL: 3, IFCMATERIALPROFILE: 6, IFCMATERIALPROFILESET: 4,
  IFCMATERIALPROFILESETUSAGE: 3, IFCRELASSOCIATESMATERIAL: 6,
  IFCISHAPEPROFILEDEF: 10, IFCUSHAPEPROFILEDEF: 10,
  IFCRECTANGLEPROFILEDEF: 5, IFCRECTANGLEHOLLOWPROFILEDEF: 8,
  IFCCIRCLEHOLLOWPROFILEDEF: 5, IFCARBITRARYCLOSEDPROFILEDEF: 3,
  IFCPOLYLINE: 1, IFCEXTRUDEDAREASOLID: 4, IFCSWEPTDISKSOLID: 5,
  IFCBEAM: 9, IFCCOLUMN: 9, IFCREINFORCINGBAR: 14,
  IFCPROPERTYSINGLEVALUE: 4, IFCPROPERTYSET: 5, IFCRELDEFINESBYPROPERTIES: 6,
  IFCELEMENTQUANTITY: 6, IFCQUANTITYLENGTH: 5, IFCQUANTITYAREA: 5,
  IFCQUANTITYVOLUME: 5,
  IFCRELCONTAINEDINSPATIALSTRUCTURE: 6, IFCRELASSIGNSTOPRODUCT: 7,
  IFCRELASSIGNSTOGROUP: 7,
  IFCSTRUCTURALLOADSINGLEFORCE: 7, IFCSTRUCTURALLOADLINEARFORCE: 7,
  IFCSTRUCTURALLOADTEMPERATURE: 4, IFCSTRUCTURALLOADCONFIGURATION: 3,
  IFCSTRUCTURALPOINTACTION: 10, IFCSTRUCTURALLINEARACTION: 12,
  IFCSTRUCTURALCURVEACTION: 12, IFCRELCONNECTSSTRUCTURALACTIVITY: 6,
};

/** Splitst de argumentenlijst van één entiteit op het BUITENSTE komma-niveau. */
function splitsArgumenten(args) {
  const delen = [];
  let huidig = "", diepte = 0, inTekst = false;
  for (const c of args) {
    if (inTekst) { huidig += c; if (c === "'") inTekst = false; continue; }
    if (c === "'") { huidig += c; inTekst = true; continue; }
    if (c === "(") { diepte++; huidig += c; continue; }
    if (c === ")") { diepte--; huidig += c; continue; }
    if (c === "," && diepte === 0) { delen.push(huidig); huidig = ""; continue; }
    huidig += c;
  }
  delen.push(huidig);
  return delen;
}

/** Alle entiteitsregels als { id, type, args }. */
function ontleed(ifc) {
  const uit = [];
  for (const regel of ifc.split("\n")) {
    const m = /^#(\d+)=([A-Z][A-Z0-9_]*)\((.*)\);$/.exec(regel);
    if (m) uit.push({ id: m[1], type: m[2], args: splitsArgumenten(m[3]) });
  }
  return uit;
}

/** Controleert attribuutaantallen en lege gaten; retourneert de klachten. */
function syntaxKlachten(ifc) {
  const klachten = [];
  for (const e of ontleed(ifc)) {
    const verwacht = ATTRIBUTEN[e.type];
    if (verwacht === undefined) {
      klachten.push(`#${e.id}: ${e.type} staat niet in de attributentabel van deze test`);
      continue;
    }
    if (e.args.length !== verwacht) {
      klachten.push(`#${e.id}=${e.type}: ${e.args.length} attributen, verwacht ${verwacht}`);
    }
    e.args.forEach((a, i) => {
      if (a.trim() === "") klachten.push(`#${e.id}=${e.type}: attribuut ${i + 1} is LEEG`);
    });
  }
  return klachten;
}

for (const [naam, bestand] of [["portaal", ifc], ["kenmerkenmodel", ifc2]]) {
  const klachten = syntaxKlachten(bestand);
  checkEq(`${naam}: geen syntaxklachten`, klachten.length, 0);
  if (klachten.length > 0) log("    " + klachten.slice(0, 6).join("\n    "));
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: het bouwkundige model naast het rekenmodel
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Bouwkundig model: liggers, kolommen, eigenschappen en hoeveelheden");

const bouwkundigModel = {
  projectNaam: "Bouwkundig",
  nodes: [
    { id: 1, x: 0,    z: 0 },
    { id: 2, x: 0,    z: 4000 },
    { id: 3, x: 8000, z: 4000 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: "S235", profile: "HEB300" },  // kolom (90°)
    { id: 2, from: 2, to: 3, material: "S235", profile: "IPE400" },  // ligger (0°)
  ],
  supports: [{ nodeId: 1, type: "fixed" }],
  loads: [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 2, q: -8, qDir: "z",
      omschrijving: "vloer verdieping 1" },
  ],
  loadCases: [{ id: 1, name: "Permanent", type: "dead" }],
  toetsresultaten: [{
    beam_id: 2, profile_name: "IPE 400", steel_grade: "S235",
    classification: "Class1",
    checks: [{ id: "6.2.5", kind: { type: "Resistance", data: {
      id: "6.2.5", title: "Buigend moment", article: "6.2.5",
      force_state: {}, formula_latex: "", variables: [], deelstappen: [],
      value: 1, unit: "kNm", uc: null, status: "Ok", notes: [],
    } } }],
    uc_max: 0.76, status: "Ok", governing_check_id: "6.2.5",
  }],
};
const ifcB = bouwIfcRekenmodel(bouwkundigModel);

log("  — (a) een ligger en een kolom, met hun echte doorsnede");
checkEq("1× IfcBeam (de horizontale staaf)", tel(ifcB, "IFCBEAM"), 1);
checkEq("1× IfcColumn (de verticale staaf)", tel(ifcB, "IFCCOLUMN"), 1);
checkTrue("ligger heet 'Ligger 2' met materiaal en profiel",
  ifcB.includes("'Ligger 2','S235 IPE400'"));
checkTrue("kolom heet 'Kolom 1' met materiaal en profiel",
  ifcB.includes("'Kolom 1','S235 HEB300'"));
checkTrue("PredefinedType .BEAM. en .COLUMN.",
  /IFCBEAM\([^\n]*,\.BEAM\.\);/.test(ifcB) && /IFCCOLUMN\([^\n]*,\.COLUMN\.\);/.test(ifcB));
checkEq("2× IfcExtrudedAreaSolid (één lichaam per element)",
  tel(ifcB, "IFCEXTRUDEDAREASOLID"), 2);
checkTrue("de extrusie van de ligger is 8 m diep",
  /IFCEXTRUDEDAREASOLID\(#\d+,#\d+,#\d+,8\.\);/.test(ifcB));
checkTrue("de extrusie van de kolom is 4 m diep",
  /IFCEXTRUDEDAREASOLID\(#\d+,#\d+,#\d+,4\.\);/.test(ifcB));
// Het lichaam verwijst naar dezelfde IfcProfileDef als het rekenmodel: het
// nummer van de IPE400-profieldefinitie moet in de extrusie terugkomen.
const ipe = /^#(\d+)=IFCISHAPEPROFILEDEF\(\.AREA\.,'IPE400'/m.exec(ifcB);
checkTrue("de ligger extrudeert de IPE400-profieldefinitie zelf",
  ipe !== null && ifcB.includes(`IFCEXTRUDEDAREASOLID(#${ipe[1]},`));
checkEq("1× IfcRelContainedInSpatialStructure (beide elementen in het gebouw)",
  tel(ifcB, "IFCRELCONTAINEDINSPATIALSTRUCTURE"), 1);
checkEq("2× IfcRelAssignsToProduct (rekenstaaf → bouwkundig element)",
  tel(ifcB, "IFCRELASSIGNSTOPRODUCT"), 2);
checkTrue("de 'Body'-subcontext staat er",
  ifcB.includes("IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,"));

log("  — (b) eigenschappensets");
for (const set of [
  "OpenFEM2D_Doorsnede", "OpenFEM2D_Staaf", "OpenFEM2D_Toetsing",
  "Pset_BeamCommon", "Pset_ColumnCommon",
]) {
  checkTrue(`set ${set} aanwezig`, ifcB.includes(`IFCPROPERTYSET('`) && ifcB.includes(`,'${set}',`));
}
checkTrue("profielnaam als IfcLabel",
  ifcB.includes("IFCPROPERTYSINGLEVALUE('Profielnaam',$,IFCLABEL('IPE400'),$)"));
checkTrue("IPE400: A = 8450 mm² → 0,00845 m²",
  ifcB.includes("IFCPROPERTYSINGLEVALUE('Oppervlakte',$,IFCAREAMEASURE(0.00845),$)"));
checkTrue("staal: E = 210000 N/mm² → 2,1E11 Pa",
  ifcB.includes("IFCMODULUSOFELASTICITYMEASURE(210000000000.)"));
checkTrue("ligger heet 'Ligger', kolom 'Kolom' in OpenFEM2D_Staaf",
  ifcB.includes("IFCPROPERTYSINGLEVALUE('Onderdeel',$,IFCLABEL('Ligger'),$)") &&
  ifcB.includes("IFCPROPERTYSINGLEVALUE('Onderdeel',$,IFCLABEL('Kolom'),$)"));
checkTrue("kolom staat loodrecht: helling π/2 rad",
  /IFCPROPERTYSINGLEVALUE\('HellingMetDeHorizontaal',\$,IFCPLANEANGLEMEASURE\(1\.570796327\),\$\)/.test(ifcB));

log("  — (c) de toetsuitslag staat erin");
checkTrue("norm EN 1993-1-1",
  ifcB.includes("IFCPROPERTYSINGLEVALUE('Norm',$,IFCLABEL('EN 1993-1-1'),$)"));
checkTrue("maatgevende toets bij naam",
  ifcB.includes("IFCPROPERTYSINGLEVALUE('MaatgevendeToets',$,IFCLABEL('Buigend moment'),$)"));
checkTrue("normartikel 6.2.5",
  ifcB.includes("IFCPROPERTYSINGLEVALUE('Normartikel',$,IFCLABEL('6.2.5'),$)"));
checkTrue("unity check 0,76",
  ifcB.includes("IFCPROPERTYSINGLEVALUE('UnityCheck',$,IFCRATIOMEASURE(0.76),$)"));
checkTrue("voldoet = waar",
  ifcB.includes("IFCPROPERTYSINGLEVALUE('Voldoet',$,IFCBOOLEAN(.T.),$)"));
checkTrue("doorsnedeklasse 1",
  ifcB.includes("IFCPROPERTYSINGLEVALUE('Doorsnedeklasse',$,IFCLABEL('klasse 1'),$)"));
// De staaf zónder uitslag mag er geen krijgen: één set per getoetste staaf.
checkEq("één OpenFEM2D_Toetsing (alleen de getoetste staaf)",
  (ifcB.match(/'OpenFEM2D_Toetsing'/g) ?? []).length, 1);

log("  — (d) hoeveelheden");
checkEq("2× IfcElementQuantity", tel(ifcB, "IFCELEMENTQUANTITY"), 2);
checkTrue("Qto_BeamBaseQuantities en Qto_ColumnBaseQuantities",
  ifcB.includes("'Qto_BeamBaseQuantities'") && ifcB.includes("'Qto_ColumnBaseQuantities'"));
checkTrue("lengte van de ligger = 8 m",
  ifcB.includes("IFCQUANTITYLENGTH('Length',$,$,8.,$)"));
checkTrue("bruto inhoud ligger = 0,00845 × 8 = 0,0676 m³",
  ifcB.includes("IFCQUANTITYVOLUME('GrossVolume',$,$,0.0676,$)"));

log("  — (e) de lastomschrijving staat als Description bij de last");
checkTrue("lijnlast draagt 'vloer verdieping 1'",
  /IFCSTRUCTURALLINEARACTION\('[^']+',\$,'q 1','vloer verdieping 1',/.test(ifcB));

log("  — (f) geldigheid en determinisme");
const uitslagB = valideerIfc(ifcB);
if (uitslagB.fouten.length > 0) log("    fouten: " + uitslagB.fouten.join(" | "));
checkEq("validatie: geen fouten", uitslagB.fouten.length, 0);
checkEq("validatie: geen waarschuwingen", uitslagB.waarschuwingen.length, 0);
checkEq("STEP-syntaxis: geen klachten", syntaxKlachten(ifcB).length, 0);
checkEq("geen dangling #-referenties", refIntegriteit(ifcB).length, 0);
const idsB = globalIds(ifcB);
checkEq("alle GlobalId's uniek", new Set(idsB).size, idsB.length);
checkTrue("determinisme", bouwIfcRekenmodel(bouwkundigModel) === ifcB);

log("  — (g) zonder bouwkundig model blijft alleen het rekenmodel over");
const alleenReken = bouwIfcRekenmodel(bouwkundigModel, { zonderBouwkundig: true });
checkEq("geen IfcBeam", tel(alleenReken, "IFCBEAM"), 0);
checkEq("geen IfcColumn", tel(alleenReken, "IFCCOLUMN"), 0);
checkEq("geen hoeveelheden", tel(alleenReken, "IFCELEMENTQUANTITY"), 0);
checkEq("geen extrusies", tel(alleenReken, "IFCEXTRUDEDAREASOLID"), 0);
checkEq("rekenstaven blijven", tel(alleenReken, "IFCSTRUCTURALCURVEMEMBER"), 2);
checkTrue("de eigenschappensets blijven op de rekenstaaf",
  alleenReken.includes("'OpenFEM2D_Doorsnede'") &&
  alleenReken.includes("'OpenFEM2D_Toetsing'"));
checkEq("validatie: geen fouten", valideerIfc(alleenReken).fouten.length, 0);
checkEq("STEP-syntaxis: geen klachten", syntaxKlachten(alleenReken).length, 0);

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: beton — T-doorsnede en de wapeningskorf
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Beton: T-doorsnede en wapening");

const betonModel = {
  projectNaam: "Beton",
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 12000, z: 0 }],
  beams: [
    { id: 1, from: 1, to: 2, material: "C30/37", profile: "300x500",
      checkConfig: {
        betonStaalsoort: "B500B",
        betonKorf: {
          cover_mm: 30, stirrup_diameter_mm: 8,
          bottom: { count: 3, diameter_mm: 16 },
          top: { count: 2, diameter_mm: 12 },
          stirrup_spacing_mm: 200, stirrup_legs: 2,
        },
      } },
    // T-ligger zonder korf: de doorsnede komt er wél in, de wapening niet.
    { id: 2, from: 2, to: 3, material: "C30/37", profile: "T 800x450 bw=250 hf=80" },
  ],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "zRoller" }],
  loads: [],
  loadCases: [],
};
const ifcC = bouwIfcRekenmodel(betonModel);

log("  — (a) de T-doorsnede als gesloten omtrek");
checkEq("1× IfcArbitraryClosedProfileDef", tel(ifcC, "IFCARBITRARYCLOSEDPROFILEDEF"), 1);
// b = 800, h = 450, b_w = 250, h_f = 80; oorsprong in het midden van 800 × 450.
for (const punt of [
  "(-0.4,0.225)", "(0.4,0.225)", "(0.4,0.145)", "(0.125,0.145)",
  "(0.125,-0.225)", "(-0.125,-0.225)", "(-0.125,0.145)", "(-0.4,0.145)",
]) {
  checkTrue(`T-omtrek bevat hoekpunt ${punt}`,
    ifcC.includes(`IFCCARTESIANPOINT(${punt})`));
}
checkTrue("de omtrek is gesloten (eerste punt = laatste punt)",
  /IFCPOLYLINE\(\(#(\d+),(?:#\d+,)+#\1\)\)/.test(ifcC));
checkTrue("materiaalcategorie van beton is 'concrete'",
  ifcC.includes("IFCMATERIAL('C30/37',$,'concrete')"));

log("  — (b) wapening: 3 onder, 2 boven, 1 beugel");
checkEq("6× IfcReinforcingBar", tel(ifcC, "IFCREINFORCINGBAR"), 6);
checkEq("5× hoofdwapening (.MAIN.)",
  (ifcC.match(/IFCREINFORCINGBAR\([^\n]*\.MAIN\.,/g) ?? []).length, 5);
checkEq("1× beugel (.LIGATURE.)",
  (ifcC.match(/IFCREINFORCINGBAR\([^\n]*\.LIGATURE\.,/g) ?? []).length, 1);
checkTrue("onderstaaf Ø16: diameter 0,016 m en A = π/4·16² mm²",
  /IFCREINFORCINGBAR\([^\n]*'B500B',0\.016,0\.0002010619298,6\.,\.MAIN\./.test(ifcC));
checkTrue("bovenstaaf Ø12: diameter 0,012 m",
  /IFCREINFORCINGBAR\([^\n]*'B500B',0\.012,[^\n]*,\.MAIN\./.test(ifcC));
// h = 500, c = 30, Ø_beugel = 8, Ø = 16 → y = −(250 − 30 − 8 − 8) = −204 mm.
checkTrue("onderwapening ligt op y = −0,204 m (c + beugel + Ø/2 vanaf de rand)",
  ifcC.includes("IFCCARTESIANPOINT((0.,-0.204,0.))"));
// b = 300 → x = ±(150 − 30 − 8 − 8) = ±104 mm; de middelste staaf op 0.
checkTrue("de drie onderstaven staan op x = −0,104 / 0 / +0,104 m",
  ifcC.includes("IFCCARTESIANPOINT((-0.104,-0.204,0.))") &&
  ifcC.includes("IFCCARTESIANPOINT((0.104,-0.204,0.))"));
// Bovenwapening Ø12: y = 250 − 30 − 8 − 6 = 206 mm.
checkTrue("bovenwapening ligt op y = +0,206 m",
  ifcC.includes("IFCCARTESIANPOINT((-0.106,0.206,0.))"));
checkTrue("de staven lopen over de volle staaflengte (z van 0 tot 6 m)",
  ifcC.includes("IFCCARTESIANPOINT((0.,-0.204,6.))"));
checkTrue("beugel als gesloten rechthoek binnen de dekking (±0,116 / ±0,216 m)",
  ifcC.includes("IFCCARTESIANPOINT((-0.116,-0.216,0.))") &&
  ifcC.includes("IFCCARTESIANPOINT((0.116,0.216,0.))"));
checkEq("6× IfcSweptDiskSolid (elke staaf heeft een lichaam)",
  tel(ifcC, "IFCSWEPTDISKSOLID"), 6);
checkTrue("de beugelset noemt aantal en hart-op-hart",
  ifcC.includes("'OpenFEM2D_Beugels'") &&
  ifcC.includes("IFCPROPERTYSINGLEVALUE('HartOpHart',$,IFCPOSITIVELENGTHMEASURE(0.2),$)") &&
  ifcC.includes("IFCPROPERTYSINGLEVALUE('Aantal',$,IFCINTEGER(31),$)"));
checkTrue("de korfsamenvatting staat op het element",
  ifcC.includes("'OpenFEM2D_Wapeningskorf'") &&
  ifcC.includes("IFCPROPERTYSINGLEVALUE('Onderwapening',$,IFCLABEL('3\\X2\\00D8\\X0\\16'),$)"));
checkTrue("de wapening zit IN het element (IfcRelAggregates)",
  /IFCRELAGGREGATES\('[^']+',\$,\$,\$,#\d+,\(#\d+,#\d+,#\d+,#\d+,#\d+,#\d+\)\)/.test(ifcC));
checkTrue("wapeningsstaal B500B als eigen materiaal",
  ifcC.includes("IFCMATERIAL('B500B',$,'steel')"));
checkEq("de T-ligger zonder korf krijgt geen wapening",
  (ifcC.match(/'Staaf 2 /g) ?? []).length, 0);

log("  — (c) geldigheid");
const uitslagC = valideerIfc(ifcC);
if (uitslagC.fouten.length > 0) log("    fouten: " + uitslagC.fouten.join(" | "));
checkEq("validatie: geen fouten", uitslagC.fouten.length, 0);
checkEq("STEP-syntaxis: geen klachten", syntaxKlachten(ifcC).length, 0);
checkEq("geen dangling #-referenties", refIntegriteit(ifcC).length, 0);
const idsC = globalIds(ifcC);
checkEq("alle GlobalId's uniek", new Set(idsC).size, idsC.length);

// ─────────────────────────────────────────────────────────────────────────
// TEST 6: de validator ziet een overgeslagen attribuut
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] De validator vindt een LEEG attribuut");
const metGat = ifcB.replace(
  /^(#\d+=IFCBEAM\('[^']+',)\$,/m, "$1,");
checkTrue("een weggelaten attribuut wordt als fout gemeld",
  metGat !== ifcB &&
  valideerIfc(metGat).fouten.some(f => /LEGE parameter/.test(f)));
checkEq("het gave bestand meldt er geen", valideerIfc(ifcB).fouten.length, 0);

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Combinaties, verende aansluitingen en bedding");
{
  const model = {
    projectNaam: "Volledig",
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 12000, z: 0 }],
    beams: [
      // Staaf 1: momentveer aan het eind, normaalkrachtveer aan het begin;
      // staaf 2: scharnier aan het begin (wint van de opgegeven veer) én bedding.
      { id: 1, from: 1, to: 2, material: "S235", profile: "IPE300", veren: { endRy: 5000, startTx: 200 } },
      { id: 2, from: 2, to: 3, material: "S235", profile: "IPE300",
        releases: { startRy: true }, veren: { startRy: 9999 }, bedding: { k: 50000, b: 300 } },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "pinned" }],
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -10, qDir: "z" },
      { id: 2, type: "lineLoad", caseId: 2, beamId: 2, q: -5, qDir: "z" },
    ],
    loadCases: [{ id: 1, name: "Permanent", type: "dead" }, { id: 2, name: "Veranderlijk", type: "live" }],
    aantalCombinaties: 2,
    combinations: [
      { id: 1, name: "UGT 6.10b", type: "uls", formula: "1,2G + 1,5Q", factors: new Map([[1, 1.2], [2, 1.5]]) },
      { id: 2, name: "BGT", type: "sls", formula: "G + Q", factors: new Map([[1, 1.0], [2, 1.0], [99, 3]]) },
    ],
  };
  const ifc = bouwIfcRekenmodel(model);
  checkEq("kapotte referenties", refIntegriteit(ifc).length, 0);
  checkEq("validatie: geen fouten", valideerIfc(ifc).fouten.length, 0);
  // Combinaties
  checkEq("vier lastgroepen: twee gevallen + twee combinaties", tel(ifc, "IFCSTRUCTURALLOADGROUP"), 4);
  checkEq("twee LOAD_COMBINATION-groepen", (ifc.match(/\.LOAD_COMBINATION\./g) ?? []).length, 2);
  checkEq("vier factortoewijzingen (het onbekende geval 99 valt af)", tel(ifc, "IFCRELASSIGNSTOGROUPBYFACTOR"), 4);
  checkTrue("factor 1,2 en 1,5 staan erin",
    /IFCRELASSIGNSTOGROUPBYFACTOR\(.*,1\.2\);/m.test(ifc) && /IFCRELASSIGNSTOGROUPBYFACTOR\(.*,1\.5\);/m.test(ifc));
  checkTrue("UGT en BGT in Purpose", ifc.includes("'UGT'") && ifc.includes("'BGT'"));
  checkTrue("de combinaties hangen aan het analysemodel (LoadedBy)",
    /IFCSTRUCTURALANALYSISMODEL\([^)]*\(#\d+,#\d+,#\d+,#\d+\)/.test(ifc));
  checkTrue("de beperkingenlijst noemt de combinaties niet meer als weggelaten",
    !verzamelIfcBeperkingen(model).some((r) => /combinatie/.test(r)));
  // Veren
  checkTrue("momentveer 5000 kNm/rad = 5e6 N·m/rad op de eindverbinding",
    /IFCBOUNDARYNODECONDITION\('Verende aansluiting',IFCBOOLEAN\(\.T\.\),\$,IFCBOOLEAN\(\.T\.\),\$,IFCROTATIONALSTIFFNESSMEASURE\(5000000\.?\d*\),\$\)/.test(ifc));
  checkTrue("normaalkrachtveer 200 kN/mm = 2e8 N/m op de beginverbinding",
    /IFCBOUNDARYNODECONDITION\('Verende aansluiting',IFCLINEARSTIFFNESSMEASURE\(200000000\.?\d*\),\$,IFCBOOLEAN\(\.T\.\)/.test(ifc));
  checkTrue("scharnier wint van de veer: staaf 2 begin is .F., geen stijfheidsmaat 9999",
    /IFCBOUNDARYNODECONDITION\('Scharnier',IFCBOOLEAN\(\.T\.\),\$,IFCBOOLEAN\(\.T\.\),\$,IFCBOOLEAN\(\.F\.\),\$\)/.test(ifc)
    && !ifc.includes("9999000"));
  checkTrue("VeerMEind en VeerNBegin in OpenFEM2D_Staaf", ifc.includes("'VeerMEind'") && ifc.includes("'VeerNBegin'"));
  // Bedding
  checkTrue("BeddingK 50000 kN/m³ = 5e7 N/m³", /'BeddingK',\$,IFCMODULUSOFSUBGRADEREACTIONMEASURE\(50000000\.?\d*\)/.test(ifc));
  checkTrue("BeddingBreedte 300 mm = 0,3 m", /'BeddingBreedte',\$,IFCPOSITIVELENGTHMEASURE\(0\.3\)/.test(ifc));
  checkTrue("zonder combinaties in de invoer blijft de melding staan",
    verzamelIfcBeperkingen({ ...model, combinations: undefined }).some((r) => /combinatie/.test(r)));
  checkEq("determinisme", bouwIfcRekenmodel(model), ifc);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald\n`);
process.exit(failed === 0 ? 0 : 1);
