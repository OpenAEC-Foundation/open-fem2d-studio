// Unit-checks voor computeBeamSplit — nette balk-splitsing (sub-knoop).
// Regels onder test:
//   - beide delen erven materiaal + profiel
//   - releases: startzijde → deel 1, eindzijde → deel 2, tussenknoop momentvast
//   - uniforme lijnlast → beide delen zelfde q; trapezium → geïnterpoleerd
//   - temperatuurlast → gedupliceerd op beide delen
//   - knoopgebonden lasten blijven ongemoeid; geen weeslasten naar de oude staaf
// Uitvoeren: npx tsx test-splitsen.mjs

const { computeBeamSplit } = await import("./src/hooks/useFemStore.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

function approx(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: basis — materiaal/profiel-erfenis + topologie
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Basis: horizontale balk 0..6000, split op 2000, materiaal+profiel erven");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S355", profile: "IPE300" }],
    loads: [],
  };
  const r = computeBeamSplit(cur, 1, 2000, 0);
  check("resultaat niet null", r !== null);
  check("nieuwe knoop toegevoegd", r.nodes.length === 3 && r.newNodeId === 3);
  check("oude staaf weg, twee nieuwe", r.beams.length === 2 && !r.beams.some(b => b.id === 1));
  const [b1, b2] = r.beams;
  check("deel 1: from=1 → nieuwe knoop", b1.from === 1 && b1.to === 3);
  check("deel 2: nieuwe knoop → to=2", b2.from === 3 && b2.to === 2);
  check("materiaal geërfd op beide delen", b1.material === "S355" && b2.material === "S355");
  check("profiel geërfd op beide delen", b1.profile === "IPE300" && b2.profile === "IPE300");
  check("staaf-ids uniek", new Set(r.beams.map(b => b.id)).size === 2);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: releases — start → deel 1, eind → deel 2, tussenknoop momentvast
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Releases: startRy+endRy gesplitst; tussenknoop momentvast");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, releases: { startRy: true, endRy: true } }],
    loads: [],
  };
  const r = computeBeamSplit(cur, 1, 2000, 0);
  const [b1, b2] = r.beams;
  check("deel 1 houdt startRy", b1.releases?.startRy === true);
  check("deel 1 GEEN endRy (tussenknoop momentvast)", !b1.releases?.endRy);
  check("deel 2 houdt endRy", b2.releases?.endRy === true);
  check("deel 2 GEEN startRy (tussenknoop momentvast)", !b2.releases?.startRy);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: alleen start-release → deel 2 zonder releases
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Alleen startTz-release: deel 2 volledig star");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, releases: { startTz: true } }],
    loads: [],
  };
  const r = computeBeamSplit(cur, 1, 1000, 0);
  const [b1, b2] = r.beams;
  check("deel 1 houdt startTz", b1.releases?.startTz === true);
  check("deel 2 heeft geen releases", b2.releases === undefined);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: uniforme lijnlast → beide delen zelfde q, geen weeslast
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Uniforme lijnlast q=-5: beide delen zelfde q, geen weeslast");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2 }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -5, qDir: "z" }],
  };
  const r = computeBeamSplit(cur, 1, 3000, 0);
  const [b1, b2] = r.beams;
  const l1 = r.loads.filter(l => l.beamId === b1.id);
  const l2 = r.loads.filter(l => l.beamId === b2.id);
  check("deel 1 heeft één lijnlast met q=-5", l1.length === 1 && l1[0].q === -5);
  check("deel 2 heeft één lijnlast met q=-5", l2.length === 1 && l2[0].q === -5);
  check("caseId + qDir behouden", l1[0].caseId === 1 && l1[0].qDir === "z");
  check("geen last verwijst nog naar oude staaf", !r.loads.some(l => l.beamId === 1));
  check("last-ids uniek", new Set(r.loads.map(l => l.id)).size === r.loads.length);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: trapeziumlast → lineair geïnterpoleerd op splitspunt
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Trapezium qStart=-2, qEnd=-10, split op t=0.25 → qMid=-4");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 8000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2 }],
    loads: [{ id: 1, type: "lineLoad", caseId: 2, beamId: 1, q: -6, qStart: -2, qEnd: -10 }],
  };
  const r = computeBeamSplit(cur, 1, 2000, 0); // t = 2000/8000 = 0.25
  const [b1, b2] = r.beams;
  const l1 = r.loads.find(l => l.beamId === b1.id);
  const l2 = r.loads.find(l => l.beamId === b2.id);
  check("deel 1: qStart=-2 → qEnd=-4", approx(l1.qStart, -2) && approx(l1.qEnd, -4));
  check("deel 2: qStart=-4 → qEnd=-10", approx(l2.qStart, -4) && approx(l2.qEnd, -10));
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 6: trapezium op schuine staaf — t via werkelijke afstand
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Schuine staaf (3000,4000): split halverwege → qMid = gemiddelde");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 4000 }], // lengte 5000
    beams: [{ id: 1, from: 1, to: 2 }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, qStart: 0, qEnd: -8 }],
  };
  const r = computeBeamSplit(cur, 1, 1500, 2000); // halverwege → t=0.5
  const l1 = r.loads.find(l => l.beamId === r.beams[0].id);
  check("qMid = -4 op t=0.5", approx(l1.qEnd, -4));
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 7: temperatuurlast gedupliceerd, knooplast ongemoeid
// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Thermal gedupliceerd; puntlast op knoop blijft staan");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2 }],
    loads: [
      { id: 1, type: "thermal", caseId: 1, beamId: 1, deltaT: 30 },
      { id: 2, type: "pointForce", caseId: 1, nodeId: 2, fz: -10 },
    ],
  };
  const r = computeBeamSplit(cur, 1, 3000, 0);
  const thermals = r.loads.filter(l => l.type === "thermal");
  check("twee thermals, één per deel", thermals.length === 2 &&
    new Set(thermals.map(l => l.beamId)).size === 2);
  check("beide thermals deltaT=30", thermals.every(l => l.deltaT === 30));
  const pf = r.loads.find(l => l.type === "pointForce");
  check("puntlast ongewijzigd (zelfde id + nodeId)", pf.id === 2 && pf.nodeId === 2 && pf.fz === -10);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 8: lasten op ANDERE staven blijven ongemoeid
// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Last op andere staaf blijft ongewijzigd");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 6000, z: 3000 }],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 2, to: 3 }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 2, q: -3 }],
  };
  const r = computeBeamSplit(cur, 1, 3000, 0);
  const l = r.loads.find(x => x.beamId === 2);
  check("last op staaf 2 exact behouden", r.loads.length === 1 && l.id === 1 && l.q === -3);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 9: onbestaande staaf → null
// ─────────────────────────────────────────────────────────────────────────
log("\n[9] Onbestaande staaf-id retourneert null");
{
  const cur = { nodes: [{ id: 1, x: 0, z: 0 }], beams: [], loads: [] };
  check("null bij lege beams", computeBeamSplit(cur, 99, 0, 0) === null);
}

log(`\n${"─".repeat(50)}`);
log(`Resultaat: ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
