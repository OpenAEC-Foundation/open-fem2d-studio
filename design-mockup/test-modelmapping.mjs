// Modelmapping (UI-model → MultiInput) — regressietest op bouwMultiInput.
//
// WAAROM DEZE TEST BESTAAT
// De mapping bepaalt welke A en I bij een profielnaam horen, met welke α een
// thermische last rekent en in welke eenheden krachten de solver in gaan. Zij
// is uit App.tsx getrokken naar src/lib/modelNaarSolverInput.ts zodat er maar
// één vertaling van een model naar solver-invoer bestaat. Een tweede,
// nageschreven mapping zou hetzelfde model twee plausibele antwoorden geven —
// even gevaarlijk als een tweede solver.
//
// HERKOMST VAN DE GOUDEN JSON
// test-modelmapping.golden.json is NIET met de hand geschreven. Hij is
// gegenereerd door het mapping-blok zoals dat vóór de extractie in App.tsx
// stond (commit 696adb8, App.tsx regels 127-132 en 596-720, plus
// thermalAlphaForMaterial uit FemCanvas.tsx regels 285-289) letterlijk op het
// onderstaande referentiemodel te draaien. De test bewijst daarmee dat de
// geëxtraheerde functie voor hetzelfde model exact dezelfde stijfheden,
// eenheden en lasten oplevert als de app daarvoor.
//
// Het referentiemodel is het portaal uit het implementatieplan (§5.1),
// uitgebreid met de takken die in een prototype stilzwijgend wegvielen:
// staafgebonden puntlasten, thermische lasten (staal én hout), randlasten op
// een plaat, scheefstand, veeropleggingen en eigen gewicht.
//
// Draaien met: npx tsx test-modelmapping.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { bouwMultiInput, liftSpringK } =
  await import("./src/lib/modelNaarSolverInput.ts");
const { resolveSection } = await import("./src/lib/sectionResolver.ts");
const { ALPHA_STAAL, ALPHA_HOUT } = await import("./src/lib/thermalAlpha.ts");

const HIER = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? " — " + extra : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? " — " + extra : ""}`); }
}

function gelijk(naam, actueel, verwacht) {
  const same = Object.is(actueel, verwacht);
  if (same) { passed++; log(`  ✓ ${naam}: ${actueel}`); }
  else { failed++; log(`  ✗ ${naam}: ${actueel} ≠ ${verwacht}`); }
}

// ── Referentiemodel ─────────────────────────────────────────────────────────
const MODEL = {
  nodes: [
    { id: 1, x: 0, z: 0 },
    { id: 2, x: 0, z: 4000 },
    { id: 3, x: 6000, z: 4000 },
    { id: 4, x: 6000, z: 0 },
    { id: 5, x: 8000, z: 0 },
    { id: 6, x: 12000, z: 0 },
    { id: 7, x: 12000, z: 3000 },
    { id: 8, x: 8000, z: 3000 },
  ],
  beams: [
    { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" },
    {
      id: 2, from: 2, to: 3, material: "S235", profile: "IPE300",
      releases: { startRy: true, endTz: true },
    },
    { id: 3, from: 3, to: 4, material: "S235", profile: "HEA160" },
    { id: 4, from: 5, to: 8, material: "C24", profile: "96x450" },
  ],
  supports: [
    { nodeId: 1, type: "fixed" },
    { nodeId: 4, type: "fixed" },
    { nodeId: 5, type: "zSpring", k: 50 },
    { nodeId: 6, type: "rotSpring", k: 1200 },
    { nodeId: 7, type: "pinned" },
  ],
  plates: [
    { id: 1, nodeIds: [5, 6, 7, 8], thickness: 150, meshSize: 750 },
  ],
  loadCases: [
    { id: 1, name: "G", type: "dead" },
    { id: 2, name: "Q", type: "live" },
  ],
  loads: [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 2, q: -10 },
    { id: 2, type: "pointForce", caseId: 1, nodeId: 3, fx: 12.5, fz: -7.25 },
    { id: 3, type: "thermal", caseId: 1, beamId: 1, deltaT: 15 },
    { id: 4, type: "thermal", caseId: 1, beamId: 4, deltaT: 15 },
    { id: 5, type: "lineLoad", caseId: 2, beamId: 2, q: -6 },
    {
      id: 6, type: "lineLoad", caseId: 2, beamId: 1,
      q: -3, qStart: -2, qEnd: -4, qDir: "x", qCoord: "local",
      startFrac: 0.25, endFrac: 0.8,
    },
    { id: 7, type: "pointForce", caseId: 2, beamId: 2, posFrac: 0.35, fx: 3, fz: -9 },
    { id: 8, type: "pointForce", caseId: 2, beamId: 3, posFrac: 1.7, fx: 0, fz: -4 },
    { id: 9, type: "pointMoment", caseId: 2, nodeId: 2, my: 4.5 },
    { id: 10, type: "edgeLoad", caseId: 2, plateId: 1, edge: "top", q: -2.5, qDir: "z" },
  ],
  selfWeightEnabled: true,
  scheefstandEnabled: true,
  scheefstandNoemer: 250,
  scheefstandRichting: -1,
};

const uit = bouwMultiInput(MODEL);

// ── [0] Gouden vergelijking: veld voor veld gelijk aan de mapping van vóór
//        de extractie. Dit is het bewijs dat de app zich identiek gedraagt.
log("\n[0] Gouden vergelijking met de mapping van vóór de extractie");
const golden = JSON.parse(readFileSync(join(HIER, "test-modelmapping.golden.json"), "utf8"));
// JSON.stringify laat `undefined` vallen; de gouden JSON is op dezelfde manier
// gemaakt, dus dezelfde normalisatie op beide kanten.
const actueel = JSON.parse(JSON.stringify(uit));

function verschillen(a, b, pad = "") {
  const uitkomst = [];
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return [`${pad}: type verschilt`];
    if (a.length !== b.length) uitkomst.push(`${pad}: lengte ${a.length} ≠ ${b.length}`);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      uitkomst.push(...verschillen(a[i], b[i], `${pad}[${i}]`));
    }
    return uitkomst;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const sleutels = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of sleutels) uitkomst.push(...verschillen(a[k], b[k], pad ? `${pad}.${k}` : k));
    return uitkomst;
  }
  if (!Object.is(a, b)) uitkomst.push(`${pad}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  return uitkomst;
}

const diff = verschillen(actueel, golden);
ok("MultiInput exact gelijk aan de gouden uitkomst", diff.length === 0,
   diff.length ? `${diff.length} verschil(len): ${diff.slice(0, 8).join("; ")}` : "0 verschillen");

// ── [1] Doorsneden: de stijfheden komen uit resolveSection, niet uit de
//        solver-default. Dit is de kern van de veiligheidsclaim.
log("\n[1] Doorsneden uit de profieldatabase");
const hea = resolveSection("S235", "HEA160");
const ipe = resolveSection("S235", "IPE300");
const hout = resolveSection("C24", "96x450");
gelijk("staaf 1 A = A(HEA160)", uit.beams[0].A, hea.A);
gelijk("staaf 1 I = I(HEA160)", uit.beams[0].I, hea.I);
gelijk("staaf 1 E = E(HEA160)", uit.beams[0].E, hea.E);
gelijk("staaf 2 A = A(IPE300)", uit.beams[1].A, ipe.A);
gelijk("staaf 2 I = I(IPE300)", uit.beams[1].I, ipe.I);
gelijk("staaf 4 A = b·h (96x450)", uit.beams[3].A, hout.A);
gelijk("staaf 4 I = b·h³/12", uit.beams[3].I, hout.I);
gelijk("staaf 4 E = E_0,mean(C24)", uit.beams[3].E, hout.E);
ok("staal en hout krijgen niet dezelfde E", uit.beams[0].E !== uit.beams[3].E,
   `${uit.beams[0].E} vs ${uit.beams[3].E} N/mm²`);

// ── [2] Releases: legacy scharnierpaar én het volledige per-DOF-object.
log("\n[2] Releases");
gelijk("staaf 2 startConnection", uit.beams[1].startConnection, "hinge");
gelijk("staaf 2 endConnection", uit.beams[1].endConnection, "fixed");
ok("staaf 2 releases-object gaat mee", uit.beams[1].releases?.endTz === true);
gelijk("staaf 1 startConnection", uit.beams[0].startConnection, "fixed");

// ── [3] Eenheden: kN → N, kNm → N·mm, kN/mm → N/mm, kNm/rad → N·mm/rad.
log("\n[3] Eenheidsconversies");
const pl3 = uit.pointLoads.find(p => p.nodeId === 3);
gelijk("puntlast fx 12,5 kN → N", pl3.fx, 12500);
gelijk("puntlast fz −7,25 kN → N", pl3.fz, -7250);
const pm2 = uit.pointLoads.find(p => p.nodeId === 2);
gelijk("koppel 4,5 kNm → N·mm", pm2.my, 4.5e6);
const bpl = uit.beamPointLoads.find(p => p.beamId === 2);
gelijk("staafpuntlast fx 3 kN → N", bpl.fx, 3000);
gelijk("staafpuntlast fz −9 kN → N", bpl.fz, -9000);
gelijk("staafpuntlast posFrac", bpl.posFrac, 0.35);
const bplClamp = uit.beamPointLoads.find(p => p.beamId === 3);
gelijk("posFrac 1,7 geklemd op 1", bplClamp.posFrac, 1);
const veerZ = uit.supports.find(s => s.nodeId === 5);
gelijk("zSpring 50 kN/mm → N/mm", veerZ.k, 50000);
const veerRot = uit.supports.find(s => s.nodeId === 6);
gelijk("rotSpring 1200 kNm/rad → N·mm/rad", veerRot.k, 1.2e9);
gelijk("starre inklemming heeft geen k", uit.supports[0].k, undefined);
gelijk("liftSpringK op een starre oplegging", liftSpringK({ type: "fixed", k: 3 }), undefined);
const lijn = uit.loads.find(l => l.caseId === 2 && l.beamId === 2);
gelijk("lijnlast kN/m = N/mm, ongewijzigd", lijn.q, -6);

// ── [4] Deellast- en richtingsvelden gaan ongeschonden mee.
log("\n[4] Deellast en lastrichting");
const deel = uit.loads.find(l => l.caseId === 2 && l.beamId === 1);
gelijk("qStart", deel.qStart, -2);
gelijk("qEnd", deel.qEnd, -4);
gelijk("qDir", deel.qDir, "x");
gelijk("qCoord", deel.qCoord, "local");
gelijk("startFrac", deel.startFrac, 0.25);
gelijk("endFrac", deel.endFrac, 0.8);

// ── [5] Thermiek: α per materiaal, geen staal-α op hout.
log("\n[5] Thermische lasten");
const thStaal = uit.thermalLoads.find(t => t.beamId === 1);
const thHout = uit.thermalLoads.find(t => t.beamId === 4);
gelijk("staal α", thStaal.alpha, ALPHA_STAAL);
gelijk("hout α", thHout.alpha, ALPHA_HOUT);
gelijk("ΔT gaat ongewijzigd mee", thStaal.deltaT, 15);
ok("hout rekent niet met staal-α", thHout.alpha !== thStaal.alpha);

// ── [6] Randlasten op de plaat.
log("\n[6] Randlasten");
gelijk("aantal randlasten", uit.edgeLoads.length, 1);
gelijk("randlast plaat-id", uit.edgeLoads[0].plateId, 1);
gelijk("randlast rand", uit.edgeLoads[0].edge, "top");
gelijk("randlast p (kN/m = N/mm)", uit.edgeLoads[0].p, -2.5);
gelijk("randlast richting", uit.edgeLoads[0].dir, "z");
gelijk("randlast belastinggeval", uit.edgeLoads[0].caseId, 2);

// ── [7] Scheefstand: φ = 1/noemer, richting ±x.
log("\n[7] Scheefstand");
gelijk("φ = 1/250", uit.scheefstand.phi, 1 / 250);
gelijk("richting", uit.scheefstand.richting, -1);
const zonder = bouwMultiInput({ ...MODEL, scheefstandEnabled: false });
gelijk("uit ⇒ geen scheefstand-object", zonder.scheefstand, undefined);

// ── [8] Eigen gewicht: q = −ρ·A·g op het eerste dead-geval, vóór de
//        gebruikerslasten, en plaat-eigengewicht op datzelfde geval.
log("\n[8] Eigen gewicht");
const eigen = uit.loads.filter(l => l.caseId === 1 && l.q !== -10);
gelijk("eigengewichtslasten: één per staaf", eigen.length, 4);
ok("eigen gewicht is neerwaarts (q < 0)", eigen.every(l => l.q < 0));
ok("eigen gewicht staat vóór de gebruikerslasten",
   uit.loads.slice(0, 4).every(l => l.caseId === 1 && l.q !== -10));
gelijk("plaat-eigengewicht op het dead-geval", uit.plates[0].selfWeightCaseId, 1);
const zonderEG = bouwMultiInput({ ...MODEL, selfWeightEnabled: false });
gelijk("uit ⇒ alleen de gebruikerslasten", zonderEG.loads.length, 3);
gelijk("uit ⇒ geen plaat-eigengewicht", zonderEG.plates[0].selfWeightCaseId, undefined);

// ── [9] Plaatdefaults worden aangevuld, opgegeven waarden blijven staan.
log("\n[9] Plaatvelden");
gelijk("opgegeven dikte blijft", uit.plates[0].thickness, 150);
gelijk("opgegeven meshSize blijft", uit.plates[0].meshSize, 750);
gelijk("default E", uit.plates[0].E, 210000);
gelijk("default nu", uit.plates[0].nu, 0.3);
gelijk("default rho", uit.plates[0].rho, 7850);

// ── [10] Zuiverheid: bouwMultiInput muteert de invoer niet.
log("\n[10] Pure functie");
const kopie = JSON.parse(JSON.stringify(MODEL));
bouwMultiInput(MODEL);
ok("model onveranderd na aanroep", JSON.stringify(MODEL) === JSON.stringify(kopie));

log(`\n${failed === 0 ? "ALLE TESTS GESLAAGD" : "TESTS GEFAALD"}: ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
