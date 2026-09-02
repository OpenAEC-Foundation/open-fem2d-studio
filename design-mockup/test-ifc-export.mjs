// Test IFC4-export van het rekenmodel (src/io/ifcExport.ts).
// Verifieert de SPF-omlijsting, entiteit-aantallen, referentie-integriteit,
// eenheidsconversies (mm → m, kN → N), GlobalId's en determinisme.
//
// Stijl: test-veldzakking.mjs. Draaien met: npx tsx test-ifc-export.mjs

const { bouwIfcRekenmodel } = await import("./src/io/ifcExport.ts");

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

/** GlobalId's: eerste attribuut van rooted entiteiten, 22 tekens IFC-base64. */
function globalIds(ifc) {
  return [...ifc.matchAll(/=IFC[A-Z0-9]+\('([0-9A-Za-z_$]{22})',/g)].map(m => m[1]);
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
log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald\n`);
process.exit(failed === 0 ? 0 : 1);
