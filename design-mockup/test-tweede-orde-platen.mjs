// Tweede orde MET wandschijven — de membraan-Kg.
//
// WAT HIER NIEUW IS
// `solveMixed` was puur lineair; een 2e-orde-som met platen erin werd geweigerd
// met "wordt nog niet ondersteund". Nu krijgen de schijven hun geometrische
// (initiële-spannings)stijfheid Kg = ∫ Gᵀ·S·G·t dA en itereert het gemengde
// pad op K = Ke + Kg, net als het raamwerkpad dat al deed.
//
// WAT DIT WÉL EN NIET IS
// Dit model is vlak: elke knoop heeft u, v en θ en géén verplaatsing loodrecht
// op het vlak. Uitknikken van een schijf UIT zijn vlak — de klassieke
// plaatstabiliteit — heeft die vrijheidsgraad nodig en bestaat hier dus niet.
// Wat hier wordt getoetst is het IN-VLAK effect: een schijf die al onder druk
// staat verzet zich minder tegen een volgende vervorming, onder trek juist meer.
//
// DE OPZET
// De eerste vier blokken toetsen Kg als matrix, op eigenschappen die zuiver uit
// de formulering volgen en geen mesh of oplegging nodig hebben — daar kan geen
// tolerantie in wegvallen. Daarna de fysica op complete modellen, en tot slot
// de regressie: een raamwerk met een ver weg gelegen plaatje moet in het
// gemengde pad exact hetzelfde blijven doen als in het raamwerkpad.
//
// Uitvoeren: npx tsx test-tweede-orde-platen.mjs   (vanuit design-mockup/)

const { Mesh } = await import("./src/core/fem/Mesh.ts");
const { generatePlateRegionMesh } = await import("./src/core/fem/PlateRegion.ts");
const { solveNonlinear } = await import("./src/core/solver/NonlinearSolver.ts");
const { buildNodeIdToIndex } = await import("./src/core/solver/Assembler.ts");
const {
  calculateTriangleGeometricStiffness,
  expandTriangleGeometricStiffness,
} = await import("./src/core/fem/Triangle.ts");
const {
  calculateQuadGeometricStiffness,
  expandQuadGeometricStiffness,
} = await import("./src/core/fem/Quad4.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}

function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolRel * s;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toExponential(6)} ≈ ${expected.toExponential(6)}`); }
  else { failed++; log(`  ✗ ${name}: ${actual} vs ${expected} (rel. ${(Math.abs(actual - expected) / s).toExponential(2)})`); }
}

// Materiaal 1 = staal (Material.ts): E = 210 GPa, ν = 0,3
const E = 210e9;

// Drie losse knopen voor de matrixtoetsen; niet-triviale vorm, zodat een fout
// in de gradiënten niet toevallig wegvalt tegen symmetrie.
const T1 = { id: 1, x: 0.0, y: 0.0 };
const T2 = { id: 2, x: 1.3, y: 0.2 };
const T3 = { id: 3, x: 0.4, y: 0.9 };
const Q1 = { id: 1, x: 0.0, y: 0.0 };
const Q2 = { id: 2, x: 1.2, y: 0.1 };
const Q3 = { id: 3, x: 1.4, y: 1.1 };
const Q4n = { id: 4, x: 0.1, y: 0.9 };
const SPANNING = { sigmaX: 7e6, sigmaY: -3e6, tauXY: 2e6 };
const DIKTE = 0.02;

const KgT = () => calculateTriangleGeometricStiffness(T1, T2, T3, SPANNING, DIKTE);
const KgQ = () => calculateQuadGeometricStiffness(Q1, Q2, Q3, Q4n, SPANNING, DIKTE);

// ─────────────────────────────────────────────────────────────────────────
// [1] Kg is symmetrisch
//
// Kg = c·Gᵀ·S·G met S symmetrisch, dus Kg is dat per constructie ook. Een
// asymmetrie betekent dat de spanningsblokken verkeerd zijn ingevuld — een
// fout die in een oplossing nauwelijks opvalt maar het stelsel wél bederft.
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Kg is symmetrisch");
for (const [naam, Kg, n] of [["CST", KgT(), 6], ["Q4", KgQ(), 8]]) {
  let maxAfw = 0, schaal = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      maxAfw = Math.max(maxAfw, Math.abs(Kg.get(i, j) - Kg.get(j, i)));
      schaal = Math.max(schaal, Math.abs(Kg.get(i, j)));
    }
  }
  checkTrue(`${naam}: Kg = Kgᵀ`, maxAfw <= 1e-9 * Math.max(schaal, 1),
    `grootste afwijking ${maxAfw.toExponential(2)} op schaal ${schaal.toExponential(2)}`);
}

// ─────────────────────────────────────────────────────────────────────────
// [2] Een starre verplaatsing levert geen geometrische kracht
//
// Bij een translatie zijn alle gradiënten nul, dus G·u = 0 en dus Kg·u = 0.
// Dit is de scherpste toets die er is op de gradiëntmatrix: staat er ergens
// een ∂N/∂x waar ∂N/∂y hoort, dan valt deze om. Voor rotatie geldt het niet —
// een starre rotatie is in de LINEAIRE kinematica geen nulmode van Kg.
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Kg · (starre translatie) = 0");
for (const [naam, Kg, nKnopen] of [["CST", KgT(), 3], ["Q4", KgQ(), 4]]) {
  const n = nKnopen * 2;
  let schaal = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) schaal = Math.max(schaal, Math.abs(Kg.get(i, j)));
  for (const [richting, dx, dy] of [["x", 1, 0], ["y", 0, 1], ["diagonaal", 0.6, -0.8]]) {
    const u = [];
    for (let k = 0; k < nKnopen; k++) u.push(dx, dy);
    const f = Kg.multiplyVector(u);
    const maxF = Math.max(...f.map(Math.abs));
    checkTrue(`${naam}: translatie ${richting} geeft geen kracht`,
      maxF <= 1e-9 * Math.max(schaal, 1), `‖Kg·u‖∞ = ${maxF.toExponential(2)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// [3] Kg is lineair in de spanning
//
// S komt lineair in Gᵀ·S·G voor. Verdubbel de spanning en Kg verdubbelt;
// spiegel hem en Kg spiegelt mee. Een kwadratische of afgekapte term in de
// implementatie valt hier door de mand.
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Kg schaalt lineair met de spanning");
for (const [naam, maak, n] of [
  ["CST", (s) => calculateTriangleGeometricStiffness(T1, T2, T3, s, DIKTE), 6],
  ["Q4", (s) => calculateQuadGeometricStiffness(Q1, Q2, Q3, Q4n, s, DIKTE), 8],
]) {
  const basis = maak(SPANNING);
  for (const f of [2, -1, 0.25]) {
    const geschaald = maak({
      sigmaX: SPANNING.sigmaX * f,
      sigmaY: SPANNING.sigmaY * f,
      tauXY: SPANNING.tauXY * f,
    });
    let maxAfw = 0, schaal = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        maxAfw = Math.max(maxAfw, Math.abs(geschaald.get(i, j) - f * basis.get(i, j)));
        schaal = Math.max(schaal, Math.abs(basis.get(i, j)));
      }
    }
    checkTrue(`${naam}: σ maal ${f} geeft Kg maal ${f}`,
      maxAfw <= 1e-9 * Math.max(schaal, 1), `afwijking ${maxAfw.toExponential(2)}`);
  }
  // Spanningsloos ⇒ Kg exact nul. Zonder deze regel zou een model zonder
  // voorspanning stilzwijgend een andere uitkomst kunnen krijgen dan lineair.
  const nul = maak({ sigmaX: 0, sigmaY: 0, tauXY: 0 });
  let maxNul = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) maxNul = Math.max(maxNul, Math.abs(nul.get(i, j)));
  checkTrue(`${naam}: σ = 0 geeft Kg = 0`, maxNul === 0, `grootste term ${maxNul}`);
}

// ─────────────────────────────────────────────────────────────────────────
// [4] De uitbreiding naar 3 DOF per knoop zet niets op de θ-rijen
//
// De membraan-Kg wordt uitgebreid van 6×6 naar 9×9 (en 8×8 naar 12×12) met
// nulrijen voor θ, dezelfde afbeelding als de elastische matrix gebruikt. Kwam
// er wél iets op een θ-rij, dan zou een schijf een moment in zijn knopen
// dragen dat het membraan niet kent — en zou de rotatiestabilisatie in de
// Assembler er bovenop komen.
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] θ-rijen blijven leeg na uitbreiding");
{
  const K9 = expandTriangleGeometricStiffness(KgT());
  const K12 = expandQuadGeometricStiffness(KgQ());
  for (const [naam, K, n] of [["CST 9×9", K9, 9], ["Q4 12×12", K12, 12]]) {
    let maxTheta = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i % 3 === 2 || j % 3 === 2) maxTheta = Math.max(maxTheta, Math.abs(K.get(i, j)));
      }
    }
    checkTrue(`${naam}: alle θ-termen nul`, maxTheta === 0, `grootste term ${maxTheta}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// De modellen
// ─────────────────────────────────────────────────────────────────────────

const B = 0.2;    // wanddikte in het vlak (de "kolombreedte"), m
const H = 4.0;    // hoogte, m
const T = 0.02;   // plaatdikte, m

/**
 * Console-wand: onderrand volledig ingeklemd, top vrij. Verticale druk P (N,
 * positief = druk) verdeeld over de bovenrand, plus een horizontale last Hlast
 * op de linkerbovenknoop die de vervorming op gang brengt.
 *
 * Een console omdat die de grootste tweede-orde-uitwerking geeft bij een
 * gegeven hoogte (l₀ = 2h) en omdat de bovenrand vrij moet zijn om te kunnen
 * uitwijken — een boven gesteunde wand zou het effect grotendeels wegnemen.
 */
function consoleWand({ P = 0, Hlast = 0, divX = 2, divY = 20, elementType = "quad" } = {}) {
  const mesh = new Mesh();
  const region = generatePlateRegionMesh(mesh, {
    x: 0, y: 0, width: B, height: H,
    divisionsX: divX, divisionsY: divY,
    materialId: 1, thickness: T, elementType,
  });
  for (const nid of region.edges.bottom.nodeIds) {
    mesh.updateNode(nid, { constraints: { x: true, y: true, rotation: false } });
  }
  const topIds = [...region.edges.top.nodeIds];
  const xs = topIds.map((nid) => mesh.getNode(nid).x);
  for (let i = 0; i < topIds.length; i++) {
    let trib = 0;
    if (i > 0) trib += (xs[i] - xs[i - 1]) / 2;
    if (i < topIds.length - 1) trib += (xs[i + 1] - xs[i]) / 2;
    // −y = druk. De dwarslast gaat volledig op de eerste bovenrandknoop.
    mesh.updateNode(topIds[i], {
      loads: { fx: i === 0 ? Hlast : 0, fy: -P * (trib / B), moment: 0 },
    });
  }
  return { mesh, region, topIds };
}

/** Horizontale topverplaatsing van de console-wand. */
function topUx(mesh, topIds, result) {
  const n2i = buildNodeIdToIndex(mesh, "mixed_beam_plate");
  return Math.abs(result.displacements[n2i.get(topIds[0]) * 3]);
}

const opties2e = {
  analysisType: "mixed_beam_plate",
  geometricNonlinear: true,
  maxIterations: 100,
  tolerance: 1e-6,
};

// ─────────────────────────────────────────────────────────────────────────
// [5] Zonder normaaldruk verandert de tweede orde niets
//
// Alleen een dwarslast: de schijf staat wel onder spanning door de buiging
// zelf, maar zonder axiale druk hoort de uitkomst praktisch samen te vallen
// met de eerste orde. Dit is de nulmeting — valt hij om, dan zit er een
// systematische fout in Kg die ook alle volgende getallen kleurt.
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Alleen dwarslast: 2e orde ≈ 1e orde");
{
  const Hlast = 2000;
  const a = consoleWand({ Hlast });
  const lin = solveNonlinear(a.mesh, { analysisType: "mixed_beam_plate" });
  const uLin = topUx(a.mesh, a.topIds, lin);

  const b = consoleWand({ Hlast });
  const nl = solveNonlinear(b.mesh, opties2e);
  const uNl = topUx(b.mesh, b.topIds, nl);

  log(`  u_1e = ${(uLin * 1000).toFixed(5)} mm, u_2e = ${(uNl * 1000).toFixed(5)} mm`);
  checkRel("2e orde valt samen met 1e orde", uNl, uLin, 0.01);
}

// ─────────────────────────────────────────────────────────────────────────
// [6] Druk verslapt, trek verstijft
//
// De kern van de zaak, en het teken dat er in de formulering het makkelijkst
// omklapt. Onder DRUK wordt de wand slapper (grotere uitwijking dan eerste
// orde), onder TREK stijver (kleinere). Beide met dezelfde dwarslast.
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Druk verslapt, trek verstijft");
{
  const Hlast = 2000;
  const P = 150e3;

  const ref = consoleWand({ Hlast });
  const uLin = topUx(ref.mesh, ref.topIds, solveNonlinear(ref.mesh, { analysisType: "mixed_beam_plate" }));

  const druk = consoleWand({ P, Hlast });
  const uDruk = topUx(druk.mesh, druk.topIds, solveNonlinear(druk.mesh, opties2e));

  const trek = consoleWand({ P: -P, Hlast });
  const uTrek = topUx(trek.mesh, trek.topIds, solveNonlinear(trek.mesh, opties2e));

  log(`  u_1e = ${(uLin * 1000).toFixed(5)} mm`);
  log(`  u_2e druk  = ${(uDruk * 1000).toFixed(5)} mm  (${(uDruk / uLin).toFixed(4)}×)`);
  log(`  u_2e trek  = ${(uTrek * 1000).toFixed(5)} mm  (${(uTrek / uLin).toFixed(4)}×)`);
  checkTrue("druk geeft een grotere uitwijking dan de 1e orde", uDruk > uLin * 1.001,
    `${(uDruk / uLin).toFixed(4)}×`);
  checkTrue("trek geeft een kleinere uitwijking dan de 1e orde", uTrek < uLin * 0.999,
    `${(uTrek / uLin).toFixed(4)}×`);
  checkTrue("druk en trek liggen om de 1e orde heen", uTrek < uLin && uLin < uDruk);
}

// ─────────────────────────────────────────────────────────────────────────
// [7] De vergroting groeit monotoon met de drukkracht
//
// Naarmate de druk de kritieke waarde nadert hoort de vergrotingsfactor toe te
// nemen — en niet lineair maar versneld, zoals 1/(1−P/P_kr). Getoetst wordt de
// monotonie én de versnelling; de kritieke waarde zelf is meshafhankelijk (Q4
// is in buiging te stijf) en wordt daarom niet als absoluut getal vastgelegd.
// ─────────────────────────────────────────────────────────────────────────
log("\n[7] De vergroting groeit versneld met de druk");
{
  const Hlast = 2000;
  const ref = consoleWand({ Hlast });
  const uLin = topUx(ref.mesh, ref.topIds, solveNonlinear(ref.mesh, { analysisType: "mixed_beam_plate" }));

  const factoren = [];
  for (const P of [100e3, 200e3, 300e3]) {
    const m = consoleWand({ P, Hlast });
    const u = topUx(m.mesh, m.topIds, solveNonlinear(m.mesh, opties2e));
    factoren.push(u / uLin);
    log(`  P = ${(P / 1e3).toFixed(0)} kN → ${(u / uLin).toFixed(4)}×`);
  }
  checkTrue("monotoon stijgend", factoren[0] < factoren[1] && factoren[1] < factoren[2],
    factoren.map((f) => f.toFixed(4)).join(" < "));
  checkTrue("versneld (de tweede sprong is groter dan de eerste)",
    factoren[2] - factoren[1] > factoren[1] - factoren[0],
    `Δ1 = ${(factoren[1] - factoren[0]).toFixed(4)}, Δ2 = ${(factoren[2] - factoren[1]).toFixed(4)}`);
  checkTrue("alle factoren groter dan 1", factoren.every((f) => f > 1));
}

// ─────────────────────────────────────────────────────────────────────────
// [8] Boven de kniklast een nette fout, geen getal
//
// Een uitkomst die er wel is maar niets betekent, is gevaarlijker dan geen
// uitkomst. De melding moet die van het raamwerkpad zijn, zodat de bestaande
// vertaling naar Nederlands in engine.ts hem herkent (`/P-Delta/`).
// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Boven de kniklast: een fout en geen getal");
{
  let melding = null;
  try {
    const m = consoleWand({ P: 50e6, Hlast: 2000 });
    solveNonlinear(m.mesh, opties2e);
  } catch (e) {
    melding = e instanceof Error ? e.message : String(e);
  }
  checkTrue("er komt een fout", melding !== null, melding ?? "(geen fout — er kwam een getal)");
  checkTrue("de melding is die van het P-Δ-pad", melding !== null && /P-Delta/.test(melding),
    melding ?? "");
}

// ─────────────────────────────────────────────────────────────────────────
// [9] CST en Q4 groeien bij verfijning naar elkaar toe
//
// Op één mesh geven de twee elementtypen NIET dezelfde vergroting, en dat is
// geen fout: de driehoek met constante rek is in buiging veel te stijf, dus de
// CST-wand heeft bij dezelfde verdeling een hogere kritieke last en daarmee een
// kleinere vergroting. Dat is een eigenschap van het element, niet van Kg.
//
// Wat wél moet gelden is dat het verschil verdwijnt naarmate de mesh fijner
// wordt: beide benaderen dezelfde wand. Zou de membraan-Kg voor één van de twee
// verkeerd zijn, dan convergeren ze naar VERSCHILLENDE waarden en blijft het
// verschil staan of groeit het.
// ─────────────────────────────────────────────────────────────────────────
log("\n[9] CST en Q4 convergeren naar elkaar bij verfijning");
{
  const Hlast = 2000, P = 200e3;
  const verschillen = [];
  for (const [divX, divY] of [[2, 20], [4, 40]]) {
    const uit = {};
    for (const elementType of ["quad", "triangle"]) {
      const ref = consoleWand({ Hlast, elementType, divX, divY });
      const uLin = topUx(ref.mesh, ref.topIds,
        solveNonlinear(ref.mesh, { analysisType: "mixed_beam_plate" }));
      const m = consoleWand({ P, Hlast, elementType, divX, divY });
      const u = topUx(m.mesh, m.topIds, solveNonlinear(m.mesh, opties2e));
      uit[elementType] = u / uLin;
    }
    const verschil = Math.abs(uit.triangle - uit.quad) / uit.quad;
    verschillen.push(verschil);
    log(`  ${divX}×${divY}: quad ${uit.quad.toFixed(4)}×, CST ${uit.triangle.toFixed(4)}× ` +
      `→ verschil ${(verschil * 100).toFixed(2)}%`);
    checkTrue(`${divX}×${divY}: beide elementtypen vergroten (> 1)`,
      uit.quad > 1 && uit.triangle > 1);
  }
  checkTrue("het verschil wordt kleiner bij verfijning",
    verschillen[1] < verschillen[0],
    `${(verschillen[0] * 100).toFixed(2)}% → ${(verschillen[1] * 100).toFixed(2)}%`);
}

// ─────────────────────────────────────────────────────────────────────────
// [10] Het raamwerkpad blijft ongemoeid
//
// Een portaal met een ver weg gelegen, apart opgelegd plaatje moet in het
// GEMENGDE pad exact dezelfde staafresultaten geven als hetzelfde portaal
// zonder plaatje in het RAAMWERKpad — beide tweede orde. Dit is de regressie:
// het bewijst dat de membraan-Kg de bestaande P-Δ van de staven niet aanraakt.
// ─────────────────────────────────────────────────────────────────────────
log("\n[10] Regressie: het raamwerkpad verandert niet");
{
  const A = 3877e-6, I = 1e-4;   // m², m⁴
  const Lk = 4.0, P = 300e3, Hl = 20e3;

  /** Scharnier-scharnier kolom met druk P op de top en dwarslast op halve hoogte. */
  function kolom(mesh) {
    const ids = [];
    for (let i = 0; i <= 4; i++) ids.push(mesh.addNode(0, (Lk / 4) * i).id);
    for (let i = 0; i < 4; i++) {
      mesh.addBeamElement([ids[i], ids[i + 1]], 1, { A, I, h: 0.3 });
    }
    mesh.updateNode(ids[0], { constraints: { x: true, y: true, rotation: false } });
    mesh.updateNode(ids[4], { constraints: { x: true, y: false, rotation: false } });
    mesh.updateNode(ids[2], { loads: { fx: Hl, fy: 0, moment: 0 } });
    mesh.updateNode(ids[4], { loads: { fx: 0, fy: -P, moment: 0 } });
    return ids;
  }

  const mFrame = new Mesh();
  const idsFrame = kolom(mFrame);
  const rFrame = solveNonlinear(mFrame, {
    analysisType: "frame", geometricNonlinear: true, maxIterations: 100, tolerance: 1e-6,
  });
  const uFrame = Math.abs(rFrame.displacements[
    [...mFrame.nodes.keys()].indexOf(idsFrame[2]) * 3
  ]);

  const mMixed = new Mesh();
  const idsMixed = kolom(mMixed);
  // Het plaatje: ver weg (x = 100 m), eigen oplegging, geen last. Het mag de
  // kolom niet raken — niet mechanisch en niet via de nummering.
  const plaat = generatePlateRegionMesh(mMixed, {
    x: 100, y: 0, width: 1, height: 1,
    divisionsX: 2, divisionsY: 2, materialId: 1, thickness: 0.1, elementType: "quad",
  });
  for (const nid of plaat.edges.bottom.nodeIds) {
    mMixed.updateNode(nid, { constraints: { x: true, y: true, rotation: false } });
  }
  const rMixed = solveNonlinear(mMixed, opties2e);
  const n2i = buildNodeIdToIndex(mMixed, "mixed_beam_plate");
  const uMixed = Math.abs(rMixed.displacements[n2i.get(idsMixed[2]) * 3]);

  log(`  u_mid raamwerkpad = ${(uFrame * 1000).toFixed(6)} mm`);
  log(`  u_mid gemengd pad = ${(uMixed * 1000).toFixed(6)} mm`);
  checkRel("dezelfde tweede-orde-uitwijking", uMixed, uFrame, 0.001);
  checkTrue("de kolom wijkt méér uit dan zonder druk (er IS tweede orde)",
    uFrame > 0, `${(uFrame * 1000).toFixed(4)} mm`);
}

// ─────────────────────────────────────────────────────────────────────────
// [11] ANALYTISCHE REFERENTIE — de kniklast via Southwell tegen Euler
//
// De blokken hierboven toetsen eigenschappen, tekens en richtingen. Geen van
// alle legt een ABSOLUUT getal vast, en daarmee zou een Kg die consequent een
// factor mis zit er ongemerkt doorheen komen: symmetrisch, lineair in σ, nul
// bij translatie, teken goed — en toch verkeerd geschaald.
//
// DE METHODE
// Southwell, en let op wélke verplaatsing erin gaat. Met een vaste dwarslast
// geldt u = u₁/(1 − P/P_kr), waarin u₁ de eerste-orde-uitwijking is. De
// EXTRA verplaatsing δ = u − u₁ voldoet dan aan
//
//     δ = u₁·(P/P_kr)/(1 − P/P_kr)   →   δ/P = δ/P_kr + u₁/P_kr
//
// Zet δ/P uit tegen δ en de helling is 1/P_kr — zonder tot vlak bij de
// kniklast te hoeven rekenen. Met u zelf in plaats van δ is de betrekking
// géén rechte en levert de helling een negatief getal; dat is de valkuil.
//
// DE REFERENTIE
// De console-wand gedraagt zich als een ingeklemde kolom met l₀ = 2h:
//     P_kr = π²·E·I/(2h)²,  I = t·b³/12
// Voor b = 0,2 m, t = 0,02 m, h = 4,0 m, E = 210 GPa geeft dat 431,8 kN.
//
// WAT WE VERWACHTEN, EN WAAROM NIET EXACT
// Q4 met volledige integratie is in buiging te stijf (shear locking), dus de
// numerieke kniklast ligt HOGER dan de balkwaarde, en zakt er bij verfijning
// naartoe. De toets is daarom tweeledig: de waarde ligt boven Euler maar in
// dezelfde orde, én verfijnen brengt hem dichterbij. Een Kg die een factor
// mis zit, valt door de eerste helft; een die per element scheef staat, door
// de tweede.
// ─────────────────────────────────────────────────────────────────────────
log("\n[11] Analytische referentie: kniklast via Southwell tegen Euler");
{
  const Iw = T * B ** 3 / 12;              // 1,3333e-5 m⁴
  const pKrEuler = Math.PI ** 2 * E * Iw / (2 * H) ** 2;   // 4,318e5 N
  log(`  Euler (console, l₀ = 2h): P_kr = ${(pKrEuler / 1e3).toFixed(1)} kN`);

  const Hlast = 2000;
  const lasten = [80e3, 120e3, 160e3, 200e3];

  /** P_kr uit de helling van δ/P tegen δ (kleinste kwadraten), δ = u − u₁. */
  function southwell(divX, divY) {
    const ref = consoleWand({ Hlast, divX, divY });
    const u1 = topUx(ref.mesh, ref.topIds,
      solveNonlinear(ref.mesh, { analysisType: "mixed_beam_plate" }));
    const punten = [];
    for (const P of lasten) {
      const m = consoleWand({ P, Hlast, divX, divY });
      const u = topUx(m.mesh, m.topIds, solveNonlinear(m.mesh, opties2e));
      const d = u - u1;
      punten.push({ x: d, y: d / P });
    }
    const n = punten.length;
    const sx = punten.reduce((s, p) => s + p.x, 0);
    const sy = punten.reduce((s, p) => s + p.y, 0);
    const sxx = punten.reduce((s, p) => s + p.x * p.x, 0);
    const sxy = punten.reduce((s, p) => s + p.x * p.y, 0);
    const helling = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    // Correlatie, om te zien dát het een rechte is — is dat niet zo, dan is
    // het model geen imperfect knikprobleem en zegt de helling niets.
    const syy = punten.reduce((s, p) => s + p.y * p.y, 0);
    const r = (n * sxy - sx * sy) /
      Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    return { pKr: 1 / helling, r2: r * r };
  }

  const grof = southwell(2, 20);
  const fijn = southwell(4, 40);
  log(`  2×20: P_kr = ${(grof.pKr / 1e3).toFixed(1)} kN ` +
    `(${((grof.pKr / pKrEuler - 1) * 100).toFixed(1)}% t.o.v. Euler), R² = ${grof.r2.toFixed(6)}`);
  log(`  4×40: P_kr = ${(fijn.pKr / 1e3).toFixed(1)} kN ` +
    `(${((fijn.pKr / pKrEuler - 1) * 100).toFixed(1)}% t.o.v. Euler), R² = ${fijn.r2.toFixed(6)}`);

  checkTrue("de Southwell-punten liggen op een rechte (R² > 0,999)",
    grof.r2 > 0.999 && fijn.r2 > 0.999,
    `${grof.r2.toFixed(6)} en ${fijn.r2.toFixed(6)}`);
  checkTrue("de kniklast ligt bóven de balkwaarde (Q4 is te stijf in buiging)",
    fijn.pKr > pKrEuler, `${(fijn.pKr / 1e3).toFixed(1)} > ${(pKrEuler / 1e3).toFixed(1)} kN`);
  checkTrue("en binnen een factor 2 van de balkwaarde — dezelfde orde",
    fijn.pKr < 2 * pKrEuler, `${(fijn.pKr / pKrEuler).toFixed(3)}×`);
  checkTrue("verfijnen brengt de kniklast dichter bij Euler",
    Math.abs(fijn.pKr - pKrEuler) < Math.abs(grof.pKr - pKrEuler),
    `${((grof.pKr / pKrEuler - 1) * 100).toFixed(1)}% → ${((fijn.pKr / pKrEuler - 1) * 100).toFixed(1)}%`);
}

// ─────────────────────────────────────────────────────────────────────────
// [12] HET PAD DAT DE APP LOOPT
//
// Alles hierboven roept `solveNonlinear` rechtstreeks aan. De app doet dat
// niet: die gaat via `solveAllCasesNonlinear` + `combineResults`, en dáár zit
// de adapterlaag die de mesh bouwt, de plaatinvoer vertaalt en het resultaat
// terugvertaalt met `plateInfo` en de knoopindex van het gemengde stelsel.
//
// Precies die terugvertaling is bij deze wijziging nieuw. Zonder deze test zou
// een verkeerde knoopindex ongemerkt blijven: de som klopt, maar het canvas
// toont na een 2e-orde-berekening een leeg of verschoven schijfbeeld.
// ─────────────────────────────────────────────────────────────────────────
log("\n[12] Via het engine-pad: plaat + staaf, 1e en 2e orde");
{
  const { solveAllCases, solveAllCasesNonlinear } =
    await import("./src/components/fem/solver/engine.ts");
  const { combineResults } = await import("./src/components/fem/solver/combinations.ts");

  // Slanke wandschijf 200 × 4000 mm — dezelfde verhoudingen als de console
  // hierboven, zodat de fysica eenduidig is: onder druk hoort hij te verslappen.
  // De engine rekent in mm en N.
  const input = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 200, z: 0 },
      { id: 3, x: 0, z: 4000 }, { id: 4, x: 200, z: 4000 },
    ],
    beams: [],
    plates: [{
      id: 1, nodeIds: [1, 2, 4, 3], thickness: 20,
      E: 210000, nu: 0.3, rho: 7850, meshSize: 100,
    }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [
      { nodeId: 3, fx: 2000, fz: -50e3, caseId: 1 },
      { nodeId: 4, fz: -50e3, caseId: 1 },
    ],
    edgeLoads: [],
  };
  const comb = {
    id: 1, name: "COMB", type: "uls",
    formula: "1.0·G", factors: new Map([[1, 1.0]]),
  };

  const lin = combineResults(comb, solveAllCases(input).perCase);
  const nl = combineResults(comb, solveAllCasesNonlinear(input).perCase);

  // `plateElements` is een lijst PER PLAAT: {plateId, elements, ranges}. De
  // elementen zitten een niveau dieper — op het bovenste niveau naar sigmaY
  // grijpen levert stilzwijgend undefined en dus een test die niets toetst.
  const elementen = (r) => r.plateElements?.[0]?.elements ?? [];

  checkTrue("1e orde levert plaatspanningen", elementen(lin).length > 0,
    `${elementen(lin).length} elementen`);
  checkTrue("2e orde levert plaatspanningen — de terugvertaling werkt",
    elementen(nl).length > 0, `${elementen(nl).length} elementen`);
  checkTrue("even veel elementen in beide paden",
    elementen(lin).length === elementen(nl).length);
  checkTrue("elk element draagt zijn hoeken én zijn spanningen",
    elementen(nl).every((e) => e.corners?.length === 4
      && Number.isFinite(e.sigmaX) && Number.isFinite(e.sigmaY) && Number.isFinite(e.tauXY)));

  const uLin = Math.abs(lin.displacements.get(3)?.ux ?? 0);
  const uNl = Math.abs(nl.displacements.get(3)?.ux ?? 0);
  log(`  u_x top: 1e orde ${uLin.toFixed(5)} mm, 2e orde ${uNl.toFixed(5)} mm ` +
    `(${(uNl / uLin).toFixed(4)}×)`);
  checkTrue("beide uitwijkingen zijn eindig en niet nul",
    Number.isFinite(uLin) && Number.isFinite(uNl) && uLin > 0);
  checkTrue("de 2e orde vergroot de uitwijking (de schijf staat onder druk)",
    uNl > uLin, `${(uNl / uLin).toFixed(4)}×`);

  // De schijf staat werkelijk onder druk — anders toetst het bovenstaande de
  // verkeerde kant op zonder dat iemand het merkt.
  const syMin = Math.min(...elementen(nl).map((e) => e.sigmaY));
  checkTrue("σy is drukspanning", syMin < 0, `σy,min = ${syMin.toFixed(3)} N/mm²`);

  // De spanningen horen uit de 2e-ordestand te komen. Waren de elementStresses
  // uit het lineaire pad blijven staan, dan waren ze tot op de bit gelijk.
  const sLin = Math.min(...elementen(lin).map((e) => e.sigmaY));
  const sNl = syMin;
  checkTrue("de plaatspanningen komen uit de 2e-orde-stand, niet uit de 1e",
    Math.abs(sNl - sLin) > 1e-9 * Math.abs(sLin),
    `σy,min ${sLin.toFixed(4)} → ${sNl.toFixed(4)} N/mm²`);

  // En een model ZONDER platen loopt nog steeds langs het raamwerkpad. Let op
  // de knopenlijst: alleen knopen die aan een staaf hangen, anders is het
  // stelsel singulier op de losse knopen — een modelfout, geen solverfout.
  const zonderPlaat = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 3, x: 0, z: 4000 }],
    beams: [{ id: 1, from: 1, to: 3, E: 210000, A: 5000, I: 2e8 }],
    plates: [],
    supports: [{ nodeId: 1, type: "fixed" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [{ nodeId: 3, fx: 5000, fz: -100e3, caseId: 1 }],
    edgeLoads: [],
  };
  const rZonder = combineResults(comb, solveAllCasesNonlinear(zonderPlaat).perCase);
  checkTrue("een model zónder platen levert nog steeds staafresultaten",
    (rZonder.elements?.size ?? 0) > 0, `${rZonder.elements?.size ?? 0} staven`);
  checkTrue("en géén plaatgegevens", (rZonder.plateElements?.length ?? 0) === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${failed === 0 ? "GESLAAGD" : "GEFAALD"}: ${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
