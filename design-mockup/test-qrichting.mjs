// Lijnlast-richting globaal/lokaal (Load.qCoord): de adapter (engine.ts)
// projecteert LOKALE lasten exact naar globale componenten per staafhoek,
// zodat de core-paden op coordSystem "global" blijven. Deze batterij toetst:
//   [1] adapter-equivalentie: lokale q loodrecht op een 45°-staaf is exact
//       gelijk aan dezelfde last handmatig geprojecteerd als globale qx+qz;
//   [2] horizontale staaf: global-z en local-z identiek (default-sanity);
//   [3] verticale kolom met lokale dwarslast gedraagt zich als een
//       scharnier-scharnier-ligger: |M|max = qL²/8;
//   [4] scheefstand-interactie: companion op de VERTICALE component.
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

const E0 = 210000, A0 = 3877, I0 = 1.673e7;
let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Relatieve check: |actual − expected| ≤ relTol·max(|expected|, floor). */
function checkRel(name, actual, expected, relTol, floor = 1e-6) {
  const tol = relTol * Math.max(Math.abs(expected), floor);
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toPrecision(10)} ≈ ${expected.toPrecision(10)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual.toPrecision(10)} vs ${expected.toPrecision(10)} (tol ${tol.toExponential(2)})`); }
}

/** Max relatieve afwijking tussen twee arrays, genormeerd op max|b|. */
function maxRelDev(a, b) {
  const scale = Math.max(...b.map(Math.abs), 1e-9);
  let worst = 0;
  for (let i = 0; i < b.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]) / scale);
  return worst;
}

function checkBelow(name, value, limit) {
  const ok = value <= limit;
  if (ok) { passed++; log(`  ✓ ${name}: ${value.toExponential(3)} ≤ ${limit.toExponential(1)}`); }
  else    { failed++; log(`  ✗ ${name}: ${value.toExponential(3)} > ${limit.toExponential(1)}`); }
}

const solveOne = (input) => solveAllCases({ cases: [{ id: 1, name: "G" }], ...input }).perCase.get(1);

log("\n[1] Adapter-equivalentie: lokale q loodrecht op 45°-staaf ≡ handmatig geprojecteerde globale qx+qz");
{
  // Staaf (0,0)→(4000,4000): θ = 45°, L = 4000√2 mm. Scharnier + Z-rol.
  const model = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 4000 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  };
  const q = -8; // N/mm, loodrecht op de staaf (lokale z, negatief = "van de staaf af" in lokale −y)
  const th = Math.atan2(4000, 4000); // identiek aan de adapter-hoek
  const s = Math.sin(th), c = Math.cos(th);
  // Handmatige projectie (zelfde wiskunde als de adapter documenteert):
  //   (qx_glob, qz_glob) = q·(−sinθ, cosθ)
  const qxMan = q * -s, qzMan = q * c;

  const rLoc = solveOne({ ...model, loads: [{ beamId: 1, q, qDir: "z", qCoord: "local", caseId: 1 }] });
  const rMan = solveOne({
    ...model,
    loads: [
      { beamId: 1, q: qxMan, qDir: "x", caseId: 1 },
      { beamId: 1, q: qzMan, qDir: "z", caseId: 1 },
    ],
  });

  for (const nid of [1, 2]) {
    const a = rLoc.reactions.get(nid), b = rMan.reactions.get(nid);
    checkRel(`reactie fx knoop ${nid}`, a.fx, b.fx, 1e-9, 1e-3);
    checkRel(`reactie fz knoop ${nid}`, a.fz, b.fz, 1e-9, 1e-3);
  }
  const eLoc = rLoc.elements.get(1), eMan = rMan.elements.get(1);
  checkBelow("stations-M max. rel. afwijking", maxRelDev(eLoc.bendingMoment, eMan.bendingMoment), 1e-9);
  checkBelow("stations-V max. rel. afwijking", maxRelDev(eLoc.shearForce, eMan.shearForce), 1e-9);
  checkBelow("stations-N max. rel. afwijking", maxRelDev(eLoc.normalForce, eMan.normalForce), 1e-9);
}

log("\n[2] Horizontale staaf: global-z en local-z identiek (sanity: default verandert niets)");
{
  const model = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  };
  const rGlob = solveOne({ ...model, loads: [{ beamId: 1, q: -10, caseId: 1 }] }); // qCoord ontbreekt = global (default)
  const rLoc  = solveOne({ ...model, loads: [{ beamId: 1, q: -10, qDir: "z", qCoord: "local", caseId: 1 }] });
  checkRel("reactie fz knoop 1", rLoc.reactions.get(1).fz, rGlob.reactions.get(1).fz, 1e-12);
  checkRel("reactie fz knoop 2", rLoc.reactions.get(2).fz, rGlob.reactions.get(2).fz, 1e-12);
  checkBelow("stations-M max. rel. afwijking", maxRelDev(rLoc.elements.get(1).bendingMoment, rGlob.elements.get(1).bendingMoment), 1e-12);
  // Analytisch anker: M_max = qL²/8 = 10·6000²/8 N·mm
  const mMid = rGlob.elements.get(1).bendingMoment[10];
  checkRel("M_midden = qL²/8 (N·mm)", Math.abs(mMid), 10 * 6000 * 6000 / 8, 1e-6);
}

log("\n[3] Verticale kolom, lokale dwarslast → scharnier-scharnier-ligger: |M|max = qL²/8");
{
  // Kolom (0,0) onder → (0,5000) top: θ = 90°. Onder scharnier (x+z vast),
  // top X-rol (x vast, z vrij) → in DWARSrichting (wereld-x) een
  // scharnier-scharnier-ligger met overspanning L = 5000 mm; axiaal (wereld-z)
  // statisch bepaald. Lokale q dwars (qDir "z", qCoord "local") werkt in
  // wereld ±x: analytisch |M|max = qL²/8 in het midden, dwarsreacties qL/2.
  const L = 5000, q = -6; // N/mm
  const r = solveOne({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: L }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "xRoller" }],
    loads: [{ beamId: 1, q, qDir: "z", qCoord: "local", caseId: 1 }],
  });
  const e = r.elements.get(1);
  checkRel("|M|_midden = qL²/8 (N·mm)", Math.abs(e.bendingMoment[10]), Math.abs(q) * L * L / 8, 1e-6);
  checkRel("M begin ≈ 0", Math.abs(e.bendingMoment[0]), 0, 1, 1e-3);
  checkRel("M eind ≈ 0", Math.abs(e.bendingMoment[20]), 0, 1, 1e-3);
  checkRel("dwarsreactie |fx| onder = qL/2 (N)", Math.abs(r.reactions.get(1).fx), Math.abs(q) * L / 2, 1e-6);
  checkRel("dwarsreactie |fx| boven = qL/2 (N)", Math.abs(r.reactions.get(2).fx), Math.abs(q) * L / 2, 1e-6);
  // Referentie: horizontale ligger met dezelfde |q| als GLOBALE last — de
  // stations-|M| moeten samenvallen (zelfde lokale belastingtoestand).
  const rRef = solveOne({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q, caseId: 1 }],
  });
  checkBelow("stations-|M| kolom vs referentieligger", maxRelDev(
    e.bendingMoment.map(Math.abs), rRef.elements.get(1).bendingMoment.map(Math.abs)), 1e-9);
}

log("\n[4] Scheefstand: companion werkt op de VERTICALE component");
{
  const PHI = 1 / 200;
  // (a) Globale verticale q op een ligger: zelfde companion als vóór deze
  //     wijziging (test-scheefstand [2]): fx-reactie = −φ·|q|·L = −300 N.
  const rA = solveOne({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -10, caseId: 1 }],
    scheefstand: { phi: PHI, richting: 1 },
  });
  checkRel("(a) ligger: fx = −φ·|q|·L = −300 N", rA.reactions.get(1).fx, -PHI * 10 * 6000, 0.005);

  // (b) LOKALE last loodrecht op een 45°-staaf: companion = φ·|qy_glob|·L.
  //     qy_glob = q·cos45°; |qy_glob|·L = |q|·Δx = 8·4000 = 32 000 N (= V).
  //     Meting via Σfx mét − Σfx zónder scheefstand (isoleert de companion).
  const model45 = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 4000 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -8, qDir: "z", qCoord: "local", caseId: 1 }],
  };
  const met = solveOne({ ...model45, scheefstand: { phi: PHI, richting: 1 } });
  const zonder = solveOne(model45);
  const sumFx = (r) => (r.reactions.get(1)?.fx ?? 0) + (r.reactions.get(2)?.fx ?? 0);
  const companion = sumFx(met) - sumFx(zonder);
  checkRel("(b) 45° lokaal: ΔΣfx = −φ·|qy_glob|·L = −160 N", companion, -PHI * 8 * 4000, 0.005);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
