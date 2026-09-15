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

// ─────────────────────────────────────────────────────────────────────────
// TEST 10–13: toetsconfiguratie per deel (basisaudit nr 5). Tot september
// 2026 ging checkConfig letterlijk mee: een regel van 12 m met kipsteunen op
// ¼, ½ en ¾ (L_st = 3000 mm) kreeg na een splitsing op 6 m op elk deel drie
// steunen op de halve afstand (L_st = 1500 mm), zonder melding.
// ─────────────────────────────────────────────────────────────────────────
log("\n[10] Kipsteunen [0.25, 0.5, 0.75] op 12 m, split op 6 m → per deel [0.5]; steun op de knoop = 1 en 0");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE330",
      checkConfig: { lateralRestraints: [0.25, 0.5, 0.75], lateralRestraintsBottom: [0.5], bucklingLengthZ_m: 3 } }],
    loads: [],
  };
  const r = computeBeamSplit(cur, 1, 6000, 0);
  const [b1, b2] = r.beams;
  check("deel 1 bovenflens: [0.5, 1] (¼ → ½, ½ → de knoop)", JSON.stringify(b1.checkConfig.lateralRestraints) === "[0.5,1]");
  check("deel 2 bovenflens: [0, 0.5] (½ → de knoop, ¾ → ½)", JSON.stringify(b2.checkConfig.lateralRestraints) === "[0,0.5]");
  check("onderflens op de knoop: deel 1 [1], deel 2 [0]",
    JSON.stringify(b1.checkConfig.lateralRestraintsBottom) === "[1]" && JSON.stringify(b2.checkConfig.lateralRestraintsBottom) === "[0]");
  check("opgegeven kniklengte blijft op beide delen (absolute maat)",
    b1.checkConfig.bucklingLengthZ_m === 3 && b2.checkConfig.bucklingLengthZ_m === 3);
  check("geen meldingen (niets gewist)", r.meldingen.length === 0);
}

log("\n[11] Split op 4,5 m (t = 0,375): deel 1 [0.6667], deel 2 [0.2, 0.6]");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, checkConfig: { lateralRestraints: [0.25, 0.5, 0.75] } }],
    loads: [],
  };
  const r = computeBeamSplit(cur, 1, 4500, 0);
  const [b1, b2] = r.beams;
  const f1 = b1.checkConfig.lateralRestraints, f2 = b2.checkConfig.lateralRestraints;
  check("deel 1: één steun op 3 m = 0,6667", f1.length === 1 && approx(f1[0], 2 / 3, 1e-9));
  check("deel 2: steunen op 6 en 9 m = 0,2 en 0,6 (exact afgerond)", JSON.stringify(f2) === "[0.2,0.6]");
}

log("\n[12] Zeeg wordt gewist met melding; steunen buiten het deel vervallen");
{
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, checkConfig: { preCamber_mm: 12, lateralRestraints: [0.8], deflectionClass: "roof" } }],
    loads: [],
  };
  const r = computeBeamSplit(cur, 1, 3000, 0);
  const [b1, b2] = r.beams;
  check("zeeg weg op beide delen", b1.checkConfig.preCamber_mm === undefined && b2.checkConfig.preCamber_mm === undefined);
  check("één melding over de zeeg van 12 mm", r.meldingen.length === 1 && /12 mm/.test(r.meldingen[0]) && /staaf 1/.test(r.meldingen[0]));
  check("steun op 0,8 alleen op deel 2 als 0,6", b1.checkConfig.lateralRestraints === undefined && JSON.stringify(b2.checkConfig.lateralRestraints) === "[0.6]");
  check("doorbuigingsklasse blijft", b1.checkConfig.deflectionClass === "roof" && b2.checkConfig.deflectionClass === "roof");
}

log("\n[13] Betonzones 0–2000 / 2000–4000 / 4000–6000 mm, split op 3000: geknipt en verschoven");
{
  const zones = {
    longitudinal: [
      { x_start_mm: 0, x_end_mm: 2000, side: "bottom", row: { count: 2, diameter_mm: 20 } },
      { x_start_mm: 2000, x_end_mm: 4000, side: "bottom", row: { count: 4, diameter_mm: 20 } },
      { x_start_mm: 4000, x_end_mm: 6000, side: "bottom", row: { count: 2, diameter_mm: 20 } },
    ],
    stirrups: [{ x_start_mm: 0, x_end_mm: 6000, spacing_mm: 150 }],
  };
  const cur = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "C30/37", profile: "300x500", checkConfig: { betonZones: zones } }],
    loads: [],
  };
  const r = computeBeamSplit(cur, 1, 3000, 0);
  const [b1, b2] = r.beams;
  const z1 = b1.checkConfig.betonZones.longitudinal.map(z => [z.x_start_mm, z.x_end_mm, z.row.count]);
  const z2 = b2.checkConfig.betonZones.longitudinal.map(z => [z.x_start_mm, z.x_end_mm, z.row.count]);
  check("deel 1: [0,2000,2] en [2000,3000,4]", JSON.stringify(z1) === "[[0,2000,2],[2000,3000,4]]");
  check("deel 2: [0,1000,4] en [1000,3000,2]", JSON.stringify(z2) === "[[0,1000,4],[1000,3000,2]]");
  check("beugels: 0–3000 op beide delen", b1.checkConfig.betonZones.stirrups[0].x_end_mm === 3000 && b2.checkConfig.betonZones.stirrups[0].x_start_mm === 0 && b2.checkConfig.betonZones.stirrups[0].x_end_mm === 3000);
  check("zones bedekken elk deel precies", z1[0][0] === 0 && z1[1][1] === 3000 && z2[0][0] === 0 && z2[1][1] === 3000);
}

log(`\n${"─".repeat(50)}`);
log(`Resultaat: ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
