// Plaatspanningen in de MATERIAALASSEN (issue #14, deel 1): σ₁, σ₂ en τ₁₂ in
// de hoofdrichting van een richtingsafhankelijke plaat, naast σx, σy en τxy.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] DE TRANSFORMATIE ZELF tegen de hand. Met θ de hoek van de globale
//       x-as naar richting 1, c = cos θ en s = sin θ:
//           σ₁  = σx·c² + σy·s² + 2·τxy·s·c
//           σ₂  = σx·s² + σy·c² − 2·τxy·s·c
//           τ₁₂ = (σy − σx)·s·c + τxy·(c² − s²)
//       Uitgerekend voor σx = 3, σy = −1, τxy = 2 bij θ = 30°
//       (c² = 3/4, s² = 1/4, s·c = √3/4):
//           σ₁  = 9/4 − 1/4 + √3        = 2 + √3        = 3,732050808…
//           σ₂  = 3/4 − 3/4 − √3        = −√3           = −1,732050808…
//           τ₁₂ = −4·√3/4 + 2·(1/2)     = 1 − √3        = −0,732050808…
//       Plus: θ = 0° laat alles staan, θ = 90° verwisselt σx en σy en keert
//       τ om, en de invarianten σ₁ + σ₂ = σx + σy en σ₁σ₂ − τ₁₂² = σxσy − τxy²
//       gelden bij elke hoek.
//   [2] SCHIJF MET HOOFDRICHTING 30° ONDER EENASSIGE TREK. C24, horizontale
//       trek σ = 0,5 N/mm² op een wand 2000 × 3000 × 20 mm, linkerrand op
//       rollen. Een homogene spanningstoestand σx = σ is ook bij een
//       gedraaide orthotropie een exacte oplossing (constante rek, dus
//       compatibel; de rollen laten de schuifrek vrij), dus in ELK element:
//           σ₁ = σ·cos²30° = 0,375        σ₂ = σ·sin²30° = 0,125
//           τ₁₂ = −σ·sin30°·cos30° = −0,5·√3/4 = −0,216506351…
//       En élk element draagt precies de transformatie van zijn eigen
//       σx, σy, τxy (bit-gelijk, want het is dezelfde functie).
//   [3] COMBINATIES. `combineResults` rekent σ₁/σ₂/τ₁₂ opnieuw uit de
//       gecombineerde globale spanning; lineair, dus 1,35·geval 1.
//   [4] ISOTROOP ONGEWIJZIGD. Een plaat zonder materiaal en een staalplaat
//       (ook met een hoofdrichting) krijgen GEEN `materiaalassen`-veld, en
//       een staalplaat met hoofdrichting 30° geeft bit-gelijke spanningen aan
//       dezelfde plaat zonder hoofdrichting.
//
// Uitvoeren: npx tsx test-plaat-materiaalassen.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { spanningInMateriaalassen } = await import("./src/lib/plaatMateriaal.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkAbs(name, actual, expected, tol) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  checkTrue(name, ok, `${Number(actual).toExponential(12)} ≈ ${Number(expected).toExponential(12)}`);
}

const B = 2000, H = 3000, T = 20, S = 500;   // mm
const SIGMA = 0.5;                            // N/mm²

/** Horizontale trek: linkerrand op rollen (midden scharnier), trek op de rechterrand. */
function trekHorizontaal(plaatExtra = {}) {
  const nz = H / S, nodes = [];
  for (let j = 0; j <= nz; j++) nodes.push({ id: 1 + j, x: 0, z: j * S });
  const br = nz + 2, tr = nz + 3;
  nodes.push({ id: br, x: B, z: 0 }, { id: tr, x: B, z: H });
  const midden = 1 + nz / 2;
  return {
    nodes, beams: [],
    supports: nodes.slice(0, nz + 1).map((n) =>
      ({ nodeId: n.id, type: n.id === midden ? "pinned" : "xRoller" })),
    loads: [],
    plates: [{ id: 1, nodeIds: [1, br, tr, nz + 1], thickness: T, meshSize: S, ...plaatExtra }],
    edgeLoads: [{ plateId: 1, caseId: 1, edge: "right", p: SIGMA * T, dir: "x" }],
    cases: [{ id: 1, name: "Q" }],
  };
}
const plaat = (r) => r.plateElements.find((p) => p.plateId === 1);

// ═════════════════════════════════════════════════════════════════════════
log("\n[1] De transformatie tegen de hand");
{
  const w3 = Math.sqrt(3);
  const m = spanningInMateriaalassen(3, -1, 2, 30);
  checkAbs("σ₁ = 2 + √3", m.sigma1, 2 + w3, 1e-14);
  checkAbs("σ₂ = −√3", m.sigma2, -w3, 1e-14);
  checkAbs("τ₁₂ = 1 − √3", m.tau12, 1 - w3, 1e-14);

  const nul = spanningInMateriaalassen(3, -1, 2, 0);
  checkTrue("θ = 0°: ongewijzigd (bit-gelijk)",
    Object.is(nul.sigma1, 3) && Object.is(nul.sigma2, -1) && Object.is(nul.tau12, 2),
    JSON.stringify(nul));

  const negentig = spanningInMateriaalassen(3, -1, 2, 90);
  checkAbs("θ = 90°: σ₁ = σy", negentig.sigma1, -1, 1e-14);
  checkAbs("θ = 90°: σ₂ = σx", negentig.sigma2, 3, 1e-14);
  checkAbs("θ = 90°: τ₁₂ = −τxy", negentig.tau12, -2, 1e-14);

  let maxSom = 0, maxDet = 0;
  for (const hoek of [-75, -30, 0, 12.5, 30, 45, 60, 90, 135, 210, 333]) {
    const [sx, sy, t] = [1.7, -4.2, 0.9];
    const q = spanningInMateriaalassen(sx, sy, t, hoek);
    maxSom = Math.max(maxSom, Math.abs(q.sigma1 + q.sigma2 - (sx + sy)));
    maxDet = Math.max(maxDet, Math.abs(q.sigma1 * q.sigma2 - q.tau12 ** 2 - (sx * sy - t * t)));
  }
  checkAbs("invariant σ₁ + σ₂ = σx + σy (11 hoeken)", maxSom, 0, 1e-13);
  checkAbs("invariant σ₁σ₂ − τ₁₂² = σxσy − τxy² (11 hoeken)", maxDet, 0, 1e-13);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[2] C24-schijf, hoofdrichting 30°, eenassige trek");
const r30 = solveAllCases(trekHorizontaal({ materiaal: "C24", hoofdrichting: 30 })).perCase.get(1);
{
  const p = plaat(r30);
  checkTrue("plaatresultaat draagt het materiaalassen-blok met θ = 30°",
    p.materiaalassen?.hoekGraden === 30, JSON.stringify(p.materiaalassen));
  const c2 = 0.75, s2 = 0.25, sc = Math.sqrt(3) / 4;
  let maxAfw = 0, alleEigen = true, alleAanwezig = true;
  for (const el of p.elements) {
    if (!el.materiaalassen) { alleAanwezig = false; continue; }
    maxAfw = Math.max(maxAfw,
      Math.abs(el.materiaalassen.sigma1 - SIGMA * c2),
      Math.abs(el.materiaalassen.sigma2 - SIGMA * s2),
      Math.abs(el.materiaalassen.tau12 - -SIGMA * sc));
    const eigen = spanningInMateriaalassen(el.sigmaX, el.sigmaY, el.tauXY, 30);
    if (!Object.is(eigen.sigma1, el.materiaalassen.sigma1)
      || !Object.is(eigen.sigma2, el.materiaalassen.sigma2)
      || !Object.is(eigen.tau12, el.materiaalassen.tau12)) alleEigen = false;
  }
  checkTrue(`elk element (${p.elements.length}) heeft materiaalassen`, alleAanwezig && p.elements.length > 0);
  checkAbs("max |σ₁ − 0,375|, |σ₂ − 0,125|, |τ₁₂ + 0,2165…| over alle elementen", maxAfw, 0, 1e-9);
  checkTrue("elk element = transformatie van zijn eigen σx, σy, τxy (bit-gelijk)", alleEigen);
  const el0 = p.elements[0];
  checkAbs("element 1: σx = σ (eenassig)", el0.sigmaX, SIGMA, 1e-9);
  checkAbs("ranges σ₁,max", p.materiaalassen.ranges.sigma1.max, 0.375, 1e-9);
  checkAbs("ranges τ₁₂,min", p.materiaalassen.ranges.tau12.min, -0.5 * Math.sqrt(3) / 4, 1e-9);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[3] Combinaties rekenen de materiaalassen uit de gecombineerde spanning");
{
  const perCase = solveAllCases(trekHorizontaal({ materiaal: "C24", hoofdrichting: 30 })).perCase;
  const combo = { id: 9, name: "UGT", type: "uls", formula: "1,35Q", factors: new Map([[1, 1.35]]) };
  const pc = plaat(combineResults(combo, perCase));
  const p1 = plaat(perCase.get(1));
  checkTrue("combinatie draagt het materiaalassen-blok", pc.materiaalassen?.hoekGraden === 30);
  let maxAfw = 0;
  for (let i = 0; i < pc.elements.length; i++) {
    for (const k of ["sigma1", "sigma2", "tau12"]) {
      maxAfw = Math.max(maxAfw, Math.abs(pc.elements[i].materiaalassen[k] - 1.35 * p1.elements[i].materiaalassen[k]));
    }
  }
  checkAbs("σ₁/σ₂/τ₁₂ van de combinatie = 1,35 × geval", maxAfw, 0, 1e-12);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[4] Isotroop blijft ongewijzigd");
{
  const zonder = plaat(solveAllCases(trekHorizontaal({ E: 210000, nu: 0.3, rho: 7850 })).perCase.get(1));
  const staal = plaat(solveAllCases(trekHorizontaal({ materiaal: "S355" })).perCase.get(1));
  const staal30 = plaat(solveAllCases(trekHorizontaal({ materiaal: "S355", hoofdrichting: 30 })).perCase.get(1));
  for (const [naam, p] of [["zonder materiaal", zonder], ["S355", staal], ["S355 met hoofdrichting 30°", staal30]]) {
    checkTrue(`${naam}: geen materiaalassen-blok op plaat of element`,
      p.materiaalassen === undefined && p.elements.every((e) => !("materiaalassen" in e)));
    checkTrue(`${naam}: sleutels van het plaatresultaat ongewijzigd`,
      JSON.stringify(Object.keys(p)) === JSON.stringify(["plateId", "elements", "ranges"]),
      Object.keys(p).join(","));
  }
  let gelijk = staal.elements.length === staal30.elements.length;
  for (let i = 0; i < staal.elements.length && gelijk; i++) {
    gelijk = JSON.stringify(staal.elements[i]) === JSON.stringify(staal30.elements[i]);
  }
  checkTrue(`S355: hoofdrichting 30° geeft bit-gelijke elementen (${staal.elements.length})`, gelijk);
  // Isotroop onder σx = σ: de transformatie zou σ₁ = 0,375 geven, maar de
  // plaat vraagt er niet om — het veld blijft weg in plaats van een getal te
  // tonen dat bij geen enkele materiaalas hoort.
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
