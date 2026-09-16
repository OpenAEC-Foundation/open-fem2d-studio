// Last op een OPENINGSRAND — de doorvoer buiten de rekenkern: de modelcontrole
// van het canvas (lib/modelControle) en de IFC-export (io/ifcExport).
// Beide vallen buiten de barrel van de sidecarbundel en draaien daarom op de
// bron; de rekenkant (evenwicht, weigeringen in engine en MCP-poort, bit-
// identiek zonder openingen) staat in test-plaat-opening-randlast.mjs.
//
// WAT HIER BEWEZEN WORDT
//   [1] MODELCONTROLE: een last op een opening die niet bestaat, een benoemde
//       rand op een opening en een openingsrand die niet bestaat worden al
//       tijdens het tekenen gemeld — met dezelfde reden als engine en
//       MCP-poort (`bepaalPlaatlastRand`). Een geldige last op een
//       openingsrand geeft géén plaatlastbevinding.
//   [2] IFC-EXPORT: een randlast op een openingsrand wordt een lineaire actie
//       met een IfcEdge tussen twee EIGEN punten op de openingshoeken (een
//       opening hangt aan geen knoop); een randpuntlast op een openingsrand
//       een puntactie op de juiste plek. Een omtreklast blijft aan de
//       bestaande hoekvertices hangen: hij maakt geen enkel extra punt aan.
//
// Uitvoeren: npx tsx test-plaat-opening-randlast-doorvoer.mjs   (vanuit design-mockup/)

const { controleerModel } = await import("./src/lib/modelControle.ts");
const { bouwIfcRekenmodel, valideerIfc } = await import("./src/io/ifcExport.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkEq(name, actual, expected) {
  checkTrue(name, Object.is(actual, expected), `${actual} === ${expected}`);
}
const tel = (ifc, soort) => (ifc.match(new RegExp(`=${soort}\\(`, "g")) ?? []).length;

const rect = (x0, z0, x1, z1) =>
  [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
// Opening 7: hoeken (1500,1000), (2500,1000), (2500,2000), (1500,2000).
// Rand 2 (edgeIndex 2) loopt van (2500,2000) naar (1500,2000).
const OPENING = rect(1500, 1000, 2500, 2000);

function model(lasten) {
  return {
    projectNaam: "Sparing",
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }, { id: 3, x: 4000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
    beams: [],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500,
      openingen: [{ id: 7, punten: OPENING }] }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: lasten,
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
}
const randlast = (extra, id = 1) => ({ id, type: "edgeLoad", caseId: 1, plateId: 1, q: -10, qDir: "z", ...extra });

log("\n[1] Modelcontrole: openingsadres al tijdens het tekenen gekeurd");
{
  const plaatlast = (m) => controleerModel(m).filter((b) => b.soort === "plaatlast").map((b) => b.tekst);
  const onbekend = plaatlast(model([randlast({ openingId: 99, edgeIndex: 0 })]));
  checkTrue("opening die niet bestaat: gemeld met de reden van de engine",
    onbekend.some((t) => t === "Randlast 1 op plaat 1: opening 99 bestaat niet op deze plaat. Aanwezig: 7."),
    JSON.stringify(onbekend));
  const benoemd = plaatlast(model([randlast({ openingId: 7, edge: "top" })]));
  checkTrue("benoemde rand op een opening: gemeld",
    benoemd.some((t) => /Een opening heeft geen benoemde randen/.test(t)), JSON.stringify(benoemd));
  const teGroot = plaatlast(model([randlast({ openingId: 7, edgeIndex: 5 })]));
  checkTrue("rand-index buiten de opening: gemeld",
    teGroot.some((t) => /rand-index 5 bestaat niet op opening 7/.test(t)), JSON.stringify(teGroot));
  const puntZonderPositie = plaatlast(model([{ id: 2, type: "pointForce", caseId: 1, plateId: 1, openingId: 7, edgeIndex: 2, fz: -5 }]));
  checkTrue("puntlast op een openingsrand zonder positie: gemeld",
    puntZonderPositie.some((t) => /Puntlast 2 op plaat 1 heeft geen positie/.test(t)), JSON.stringify(puntZonderPositie));
  const goed = plaatlast(model([
    randlast({ openingId: 7, edgeIndex: 2 }),
    { id: 2, type: "pointForce", caseId: 1, plateId: 1, openingId: 7, edgeIndex: 2, posFrac: 0.3, fx: 3, fz: -7 },
  ]));
  checkEq("geldige last en puntlast op een openingsrand: geen plaatlastbevinding", goed.length, 0);
}

log("\n[2] IFC-export: de last hangt aan de openingsrand");
{
  const ifc = bouwIfcRekenmodel(model([
    randlast({ openingId: 7, edgeIndex: 2 }),
    { id: 2, type: "pointForce", caseId: 1, plateId: 1, openingId: 7, edgeIndex: 2, posFrac: 0.3, fx: 3, fz: -7 },
  ]));
  checkEq("geen validatiefouten", valideerIfc(ifc).fouten.length, 0);
  checkEq("één lineaire actie (de openingsrandlast)", tel(ifc, "IFCSTRUCTURALLINEARACTION"), 1);
  checkEq("één puntactie (de openingsrandpuntlast)", tel(ifc, "IFCSTRUCTURALPOINTACTION"), 1);
  // De IfcEdge loopt tussen twee vertices op de openingshoeken van rand 2:
  // van (2,5, 0, 2,0) naar (1,5, 0, 2,0) m — in DIE volgorde, want de
  // fracties tellen vanaf hoek 3 van de opening.
  const rand = /=IFCEDGE\(#(\d+),#(\d+)\)/.exec(ifc);
  const puntVanVertex = (nr) => {
    const v = new RegExp(`#${nr}=IFCVERTEXPOINT\\(#(\\d+)\\)`).exec(ifc);
    const p = v && new RegExp(`#${v[1]}=IFCCARTESIANPOINT\\(\\(([^)]*)\\)\\)`).exec(ifc);
    return p ? p[1] : null;
  };
  checkEq("IfcEdge begint op (2,5, 0, 2,0) m", rand && puntVanVertex(rand[1]), "2.5,0.,2.");
  checkEq("IfcEdge eindigt op (1,5, 0, 2,0) m", rand && puntVanVertex(rand[2]), "1.5,0.,2.");
  checkTrue("randlast: −10 kN/m = −10000 N/m in z",
    /IFCSTRUCTURALLOADLINEARFORCE\('q 1',\$,\$,IFCLINEARFORCEMEASURE\(-10000\.?\d*\)/.test(ifc));
  // Randpuntlast op fractie 0,3: x = 2500 − 0,3·1000 = 2200 mm → (2,2, 0, 2,0) m.
  checkTrue("randpuntlast op (2,2, 0, 2,0) m", /IFCCARTESIANPOINT\(\(2\.2,0\.,2\.\)\)/.test(ifc));

  // Een omtreklast hangt aan de bestaande hoekvertices: hij voegt geen punt
  // toe. Zo blijft de export van een model zonder openingslasten gelijk.
  const kaal = bouwIfcRekenmodel(model([]));
  const omtrek = bouwIfcRekenmodel(model([randlast({ edge: "top" })]));
  checkEq("omtreklast: geen extra IfcCartesianPoint", tel(omtrek, "IFCCARTESIANPOINT"), tel(kaal, "IFCCARTESIANPOINT"));
  checkEq("omtreklast: geen extra IfcVertexPoint", tel(omtrek, "IFCVERTEXPOINT"), tel(kaal, "IFCVERTEXPOINT"));
  // Een openingsrandlast voegt er precies twee toe (de twee randhoeken).
  const opening = bouwIfcRekenmodel(model([randlast({ openingId: 7, edgeIndex: 2 })]));
  checkEq("openingsrandlast: precies twee extra IfcVertexPoints",
    tel(opening, "IFCVERTEXPOINT") - tel(kaal, "IFCVERTEXPOINT"), 2);

  // Ongeldig openingsadres: de last wordt NIET op de omtrek geëxporteerd.
  const fout = bouwIfcRekenmodel(model([randlast({ openingId: 99, edgeIndex: 2 })]));
  checkEq("onbekende opening: geen lineaire actie (niet stil op de omtrek)", tel(fout, "IFCSTRUCTURALLINEARACTION"), 0);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
