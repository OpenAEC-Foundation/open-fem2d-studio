// Unit-checks voor de pure transformatielogica (verplaats/roteer/spiegel/kopieer)
// uit useFemStore — multi-selectie-bewust en volwaardig kopiëren.
// Regels onder test:
//   - collectSelectionNodeIds: knopen + staaf-eindknopen + plaat-hoekknopen,
//     gedeelde knopen precies één keer (Set)
//   - verplaatsen: alle geraakte knopen exact +dx/+dz, topologie ongewijzigd
//   - roteren 90° om een punt: coördinaten exact, lengtes invariant
//   - spiegelen: lengtes invariant, oriëntatie geflipt; degeneratie-as → null
//   - kopiëren: ALLE staafvelden mee (spread, incl. checkConfig), nieuwe
//     knoop-ids met correcte from/to-hermapping, opleggingen + knoop- en
//     staafgebonden lasten mee in hetzelfde belastinggeval; origineel ongemoeid
//   - lege selectie / lastselectie → null (aanroeper toont feedback)
// Uitvoeren: npx tsx test-transform.mjs

const {
  collectSelectionNodeIds,
  computeSelectionTranslate,
  computeSelectionRotate,
  computeSelectionMirror,
  computeSelectionCopy,
} = await import("./src/hooks/useFemStore.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

function approx(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function beamLength(nodes, beam) {
  const a = nodes.find(n => n.id === beam.from);
  const b = nodes.find(n => n.id === beam.to);
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Signed area ×2 van een driehoek van 3 knoop-ids — teken = oriëntatie. */
function signedArea2(nodes, [i, j, k]) {
  const a = nodes.find(n => n.id === i);
  const b = nodes.find(n => n.id === j);
  const c = nodes.find(n => n.id === k);
  return (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: collectSelectionNodeIds — multi met gedeelde knoop, elk 1×
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] collectSelectionNodeIds: staven + knopen + platen, gedeeld 1×");
{
  const cur = {
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 2, to: 3 }],
    plates: [{ id: 1, nodeIds: [3, 4, 5, 6] }],
  };
  const ids = collectSelectionNodeIds(cur, {
    type: "multi", nodeIds: [2, 7], beamIds: [1, 2], plateIds: [1],
  });
  check("alle geraakte knopen aanwezig",
    [1, 2, 3, 4, 5, 6, 7].every(id => ids.has(id)));
  check("gedeelde knopen precies één keer (Set-grootte klopt)", ids.size === 7);
  check("lege selectie → lege set", collectSelectionNodeIds(cur, null).size === 0);
  check("lastselectie → lege set",
    collectSelectionNodeIds(cur, { type: "load", id: 1 }).size === 0);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: verplaats multi — 2 staven + gedeelde knoop, geen dubbele delta
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Verplaats multi: 2 staven met gedeelde knoop, alles exact +dx/+dz");
{
  const cur = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 },
      { id: 3, x: 8000, z: 0 }, { id: 4, x: 99000, z: 99000 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 2, to: 3 }],
    plates: [],
  };
  const sel = { type: "multi", nodeIds: [], beamIds: [1, 2], plateIds: [] };
  const r = computeSelectionTranslate(cur, sel, 1000, 500);
  check("resultaat niet null", r !== null);
  const n1 = r.nodes.find(n => n.id === 1);
  const n2 = r.nodes.find(n => n.id === 2);
  const n3 = r.nodes.find(n => n.id === 3);
  const n4 = r.nodes.find(n => n.id === 4);
  check("knoop 1 exact verplaatst", n1.x === 1000 && n1.z === 500);
  check("gedeelde knoop 2 exact ÉÉN keer verplaatst", n2.x === 5000 && n2.z === 500);
  check("knoop 3 exact verplaatst", n3.x === 9000 && n3.z === 500);
  check("niet-geselecteerde knoop 4 ongemoeid", n4.x === 99000 && n4.z === 99000);
  check("topologie ongewijzigd (zelfde aantal knopen)", r.nodes.length === 4);
  check("origineel niet gemuteerd", cur.nodes[1].x === 4000 && cur.nodes[1].z === 0);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: verplaatsen kan niets → null (lege selectie / lastselectie)
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Verplaatsen zonder doelknopen → null (geen stille no-op)");
{
  const cur = { nodes: [{ id: 1, x: 0, z: 0 }], beams: [], plates: [] };
  check("null-selectie → null", computeSelectionTranslate(cur, null, 100, 0) === null);
  check("lege multi → null", computeSelectionTranslate(cur,
    { type: "multi", nodeIds: [], beamIds: [], plateIds: [] }, 100, 0) === null);
  check("lastselectie → null", computeSelectionTranslate(cur,
    { type: "load", id: 1 }, 100, 0) === null);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: roteer 90° om een punt — exacte coördinaten, lengtes invariant
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Roteer multi 90° om (1000, 1000): exact, lengtes invariant");
{
  const cur = {
    nodes: [
      { id: 1, x: 1000, z: 1000 }, { id: 2, x: 4000, z: 1000 },
      { id: 3, x: 1000, z: 3000 }, { id: 4, x: -5000, z: -5000 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 1, to: 3 }],
    plates: [],
  };
  const sel = { type: "multi", nodeIds: [], beamIds: [1, 2], plateIds: [] };
  const r = computeSelectionRotate(cur, sel, 1000, 1000, Math.PI / 2);
  check("resultaat niet null", r !== null);
  const n1 = r.nodes.find(n => n.id === 1);
  const n2 = r.nodes.find(n => n.id === 2);
  const n3 = r.nodes.find(n => n.id === 3);
  // Om (1000,1000), +90°: (4000,1000) → (1000,4000); (1000,3000) → (-1000,1000)
  check("centrumknoop blijft exact", approx(n1.x, 1000) && approx(n1.z, 1000));
  check("knoop 2 exact geroteerd", approx(n2.x, 1000) && approx(n2.z, 4000));
  check("knoop 3 exact geroteerd", approx(n3.x, -1000) && approx(n3.z, 1000));
  check("lengte staaf 1 invariant",
    approx(beamLength(r.nodes, cur.beams[0]), beamLength(cur.nodes, cur.beams[0])));
  check("lengte staaf 2 invariant",
    approx(beamLength(r.nodes, cur.beams[1]), beamLength(cur.nodes, cur.beams[1])));
  check("niet-geselecteerde knoop 4 ongemoeid",
    r.nodes.find(n => n.id === 4).x === -5000);
  check("lege selectie → null",
    computeSelectionRotate(cur, null, 0, 0, Math.PI / 2) === null);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: spiegelen — lengtes invariant, oriëntatie geflipt
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Spiegel om verticale as x=2000: lengtes invariant, oriëntatie flipt");
{
  const cur = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 1000, z: 0 }, { id: 3, x: 0, z: 1500 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 1, to: 3 }],
    plates: [],
  };
  const sel = { type: "multi", nodeIds: [1, 2, 3], beamIds: [], plateIds: [] };
  const before2 = signedArea2(cur.nodes, [1, 2, 3]);
  const r = computeSelectionMirror(cur, sel, 2000, 0, 2000, 1000);
  check("resultaat niet null", r !== null);
  const n1 = r.nodes.find(n => n.id === 1);
  const n2 = r.nodes.find(n => n.id === 2);
  const n3 = r.nodes.find(n => n.id === 3);
  check("knoop 1 gespiegeld naar (4000, 0)", n1.x === 4000 && n1.z === 0);
  check("knoop 2 gespiegeld naar (3000, 0)", n2.x === 3000 && n2.z === 0);
  check("knoop 3 gespiegeld naar (4000, 1500)", n3.x === 4000 && n3.z === 1500);
  check("lengte staaf 1 invariant",
    approx(beamLength(r.nodes, cur.beams[0]), 1000));
  check("lengte staaf 2 invariant",
    approx(beamLength(r.nodes, cur.beams[1]), 1500));
  const after2 = signedArea2(r.nodes, [1, 2, 3]);
  check("oriëntatie geflipt (signed area wisselt teken)",
    approx(after2, -before2) && before2 !== 0);
  check("degeneratie-as (lengte 0) → null",
    computeSelectionMirror(cur, sel, 500, 500, 500, 500) === null);
  check("lege selectie → null",
    computeSelectionMirror(cur, null, 0, 0, 1, 0) === null);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 6: kopieer volwaardig — eigenschappen, opleggingen, lasten, hermapping
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Kopieer raamwerk: alle staafvelden + opleggingen + lasten mee");
{
  const cur = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 },
      { id: 3, x: 0, z: 3000 }, { id: 4, x: 6000, z: 3000 },
    ],
    beams: [
      {
        id: 1, from: 1, to: 3, material: "S355", profile: "IPE300",
        releases: { endRy: true },
        checkConfig: { bucklingLengthY_m: 2.5, serviceClass: 2, lateralRestraints: [0.5] },
      },
      { id: 2, from: 3, to: 4, material: "C24", profile: "71x171" },
      { id: 3, from: 2, to: 4 }, // NIET geselecteerd
    ],
    plates: [],
    supports: [
      { nodeId: 1, type: "pinned" },
      { nodeId: 2, type: "fixed" }, // knoop 2 wordt niet gekopieerd
    ],
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 2, qStart: -3, qEnd: -7, qDir: "z" },
      { id: 2, type: "thermal", caseId: 2, beamId: 1, deltaT: 25 },
      { id: 3, type: "pointForce", caseId: 1, nodeId: 3, fx: 10, fz: -4 },
      { id: 4, type: "pointMoment", caseId: 2, nodeId: 4, my: 5 },
      { id: 5, type: "lineLoad", caseId: 1, beamId: 3, q: -2 }, // niet-geselecteerde staaf
    ],
  };
  const origJson = JSON.stringify(cur);
  const sel = { type: "multi", nodeIds: [], beamIds: [1, 2], plateIds: [] };
  const r = computeSelectionCopy(cur, sel, 8000, 0);
  check("resultaat niet null", r !== null);

  // Knopen: eindknopen van staaf 1+2 zijn {1,3,4} → 3 nieuwe knopen.
  check("3 nieuwe knopen (eindknopen 1,3,4), knoop 2 niet mee",
    r.nodes.length === 7 && !r.nodeIdMap.has(2));
  const map = r.nodeIdMap;
  check("nieuwe knoop-ids uniek en nieuw",
    new Set(r.nodes.map(n => n.id)).size === 7);
  const c1 = r.nodes.find(n => n.id === map.get(1));
  const c3 = r.nodes.find(n => n.id === map.get(3));
  const c4 = r.nodes.find(n => n.id === map.get(4));
  check("kopie-knopen exact op offset",
    c1.x === 8000 && c1.z === 0 && c3.x === 8000 && c3.z === 3000 &&
    c4.x === 14000 && c4.z === 3000);

  // Staven: 2 nieuwe met ALLE velden en herbonden from/to.
  check("2 nieuwe staven", r.beams.length === 5);
  const nb1 = r.beams.find(b => b.id === r.beamIdMap.get(1));
  const nb2 = r.beams.find(b => b.id === r.beamIdMap.get(2));
  check("staaf 1-kopie: from/to herbonden",
    nb1.from === map.get(1) && nb1.to === map.get(3));
  check("staaf 1-kopie: materiaal + profiel mee",
    nb1.material === "S355" && nb1.profile === "IPE300");
  check("staaf 1-kopie: releases mee", deepEq(nb1.releases, { endRy: true }));
  check("staaf 1-kopie: checkConfig volledig mee",
    deepEq(nb1.checkConfig, { bucklingLengthY_m: 2.5, serviceClass: 2, lateralRestraints: [0.5] }));
  check("staaf 2-kopie: from/to herbonden + velden mee",
    nb2.from === map.get(3) && nb2.to === map.get(4) &&
    nb2.material === "C24" && nb2.profile === "71x171");
  check("niet-geselecteerde staaf 3 niet gedupliceerd",
    r.beams.filter(b => b.from === 2 || (map.has(2) && b.from === map.get(2))).length === 1);

  // Opleggingen: pinned@1 mee naar de kopie-knoop; fixed@2 niet.
  const supCopies = r.supports.filter(s => s.nodeId === map.get(1));
  check("oplegging pinned@1 gekopieerd naar nieuwe knoop",
    supCopies.length === 1 && supCopies[0].type === "pinned");
  check("oplegging fixed@2 NIET gekopieerd (knoop niet mee)",
    r.supports.length === 3);

  // Lasten: staafgebonden naar nieuwe staaf-ids, knoopgebonden naar nieuwe
  // knoop-ids, zelfde belastinggeval; last op staaf 3 niet gedupliceerd.
  const lineCopy = r.loads.find(l => l.type === "lineLoad" && l.beamId === r.beamIdMap.get(2));
  check("trapeziumlast mee naar nieuwe staaf, zelfde LC",
    lineCopy && lineCopy.qStart === -3 && lineCopy.qEnd === -7 &&
    lineCopy.qDir === "z" && lineCopy.caseId === 1);
  const thermCopy = r.loads.find(l => l.type === "thermal" && l.beamId === r.beamIdMap.get(1));
  check("temperatuurlast mee naar nieuwe staaf, zelfde LC",
    thermCopy && thermCopy.deltaT === 25 && thermCopy.caseId === 2);
  const pfCopy = r.loads.find(l => l.type === "pointForce" && l.nodeId === map.get(3));
  check("puntlast mee naar nieuwe knoop, zelfde LC",
    pfCopy && pfCopy.fx === 10 && pfCopy.fz === -4 && pfCopy.caseId === 1);
  const pmCopy = r.loads.find(l => l.type === "pointMoment" && l.nodeId === map.get(4));
  check("moment mee naar nieuwe knoop, zelfde LC",
    pmCopy && pmCopy.my === 5 && pmCopy.caseId === 2);
  check("last op niet-geselecteerde staaf niet gedupliceerd",
    r.loads.length === 9);
  check("last-ids uniek", new Set(r.loads.map(l => l.id)).size === r.loads.length);

  // Origineel ongewijzigd (pure functie — dit borgt dat één undo-snapshot
  // de volledige kopie ongedaan maakt).
  check("origineel ongewijzigd", JSON.stringify(cur) === origJson);
  check("originele entries staan onaangeroerd vooraan in het resultaat",
    deepEq(r.nodes.slice(0, 4), cur.nodes) && deepEq(r.beams.slice(0, 3), cur.beams) &&
    deepEq(r.supports.slice(0, 2), cur.supports) && deepEq(r.loads.slice(0, 5), cur.loads));
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 7: kopieer enkelvoudig + plaat — bestaand gedrag blijft werken
// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Kopieer: enkelvoudige selecties en platen");
{
  const cur = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 1000, z: 0 },
      { id: 3, x: 1000, z: 1000 }, { id: 4, x: 0, z: 1000 },
    ],
    beams: [{ id: 1, from: 1, to: 2, profile: "HEA160" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4] }],
    supports: [],
    loads: [],
  };
  const rNode = computeSelectionCopy(cur, { type: "node", id: 1 }, 500, 500);
  check("knoopkopie: 1 nieuwe knoop op offset",
    rNode.nodes.length === 5 &&
    rNode.nodes[4].x === 500 && rNode.nodes[4].z === 500);
  const rBeam = computeSelectionCopy(cur, { type: "beam", id: 1 }, 0, 2000);
  const nb = rBeam.beams.find(b => b.id === rBeam.beamIdMap.get(1));
  check("staafkopie: profiel mee + nieuwe eindknopen",
    nb.profile === "HEA160" &&
    nb.from === rBeam.nodeIdMap.get(1) && nb.to === rBeam.nodeIdMap.get(2));
  const rPlate = computeSelectionCopy(cur, { type: "plate", id: 1 }, 2000, 0);
  const np = rPlate.plates.find(p => p.id !== 1);
  check("plaatkopie: nieuwe plaat met herbonden hoekknopen",
    np && np.nodeIds.length === 4 &&
    np.nodeIds.every((nid, i) => nid === rPlate.nodeIdMap.get(cur.plates[0].nodeIds[i])));
  check("lege selectie → null", computeSelectionCopy(cur, null, 100, 0) === null);
  check("lastselectie → null",
    computeSelectionCopy(cur, { type: "load", id: 1 }, 100, 0) === null);
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${"─".repeat(60)}`);
log(`Resultaat: ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
