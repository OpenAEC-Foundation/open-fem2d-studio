// Snedetekens: het afschuifteken in de dwarskrachtlijn en het buigteken in de
// momentenlijn (canvas-overlay, components/fem/FemResultsOverlay.tsx).
//
// WAAROM DEZE TEST BESTAAT
// Een tekentje dat de verkeerde kant op wijst is erger dan geen tekentje: het
// leest als een uitspraak over de constructie en het is er een verkeerde. Een
// test die alleen vaststelt DÁT er een teken staat, bewaakt daar niets van.
// Deze test kijkt naar de RICHTING, en doet dat op de SVG die de echte overlay
// rendert — niet op een in de test nagebouwde kopie van de meetkunde. Wie de
// assen in de overlay omdraait, breekt hier iets.
//
// DE CONVENTIE DIE HIER WORDT BEWAAKT (zie core/fem/BeamForces.ts en het blok
// SNEDETEKENS in FemResultsOverlay.tsx):
//   M > 0  trek in de ondervezel (sagging)  → de vezel is een DAL (∪), en de
//          momentenlijn wordt op de trekzijde uitgezet, dus de boog ligt aan
//          dezelfde kant als de lob.
//   V > 0  het staafdeel draait met de klok mee → aan de knoop-1-zijde wijst
//          de pijl naar lokale +y, aan de knoop-2-zijde naar −y.
//
// HET MODEL: de doorgaande houten ligger op drie steunpunten uit het
// startmodel. Daar wisselt het moment van teken BINNEN één staaf (veld positief,
// boven het tussensteunpunt negatief) — precies het geval waarvoor de tekens
// bedoeld zijn.
//
// Checks:
//  [a] ZONES        — de tekenzone-indeling: tekenwissel, dode band, nulreeks.
//  [b] TEKENWISSEL  — de houten ligger uit het startmodel wisselt werkelijk van
//                     teken binnen één staaf; anders toetst de rest niets.
//  [c] BUIGTEKEN    — dal in het veld, bult boven het steunpunt, elk aan de
//                     kant van de staaf waar zijn eigen lob ligt.
//  [d] AFSCHUIFTEKEN— bij V > 0 wijst de linker pijl omhoog en de rechter
//                     omlaag (met de klok mee); bij V < 0 andersom.
//  [e] KNOOPVOLGORDE— dezelfde ligger met omgekeerde from/to geeft hetzelfde
//                     beeld. Een verwisseling van de lokale assen valt hier om.
//  [f] TERUGHOUDEND — geen teken bij N of θ, geen teken als de gebruiker ze
//                     uitzet, en geen teken in een lob waar er geen in past.
//
// Uitvoeren: npx tsx test-snedetekens.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=snedetekens

import { renderToStaticMarkup } from "react-dom/server";
const React = (await import("react")).default;

const overlay = await import("./src/components/fem/FemResultsOverlay.tsx");
const Overlay = overlay.default;
const { DEFAULT_DISPLAY_FLAGS, bepaalTekenZones } = overlay;
const { makeInitialSnapshot, DEFAULT_LOAD_CASES } = await import("./src/hooks/useFemStore.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { solve, solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { resolveSection } = await import("./src/lib/sectionResolver.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
function check(naam, actual, expected) {
  const gelijk = Object.is(actual, expected);
  if (gelijk) { passed++; log(`  ✓ ${naam}: ${JSON.stringify(actual)}`); }
  else        { failed++; log(`  ✗ ${naam}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); }
}

// ── Schermafbeelding van de overlay ───────────────────────────────────────
// Dezelfde afbeelding als het canvas: x naar rechts, en de z-as OMGEKLAPT
// (scherm-y groeit naar beneden), zoals `worldToScreen` in FemCanvas.
const AS_Y = 300;          // scherm-y van de staafas (z = 0)
const SCHAAL = 0.08;       // px per mm
const X_LINKS = 60;        // scherm-x van de meest linkse knoop

function rendereer({ nodes, beams, supports, result, vlaggen = {} }) {
  const x0 = Math.min(...nodes.map((n) => n.x));
  const w2s = (x, z) => ({ x: X_LINKS + (x - x0) * SCHAAL, y: AS_Y - z * SCHAAL });
  return renderToStaticMarkup(React.createElement(Overlay, {
    nodes, beams, supports, result,
    worldToScreen: w2s, canvasW: 1200, canvasH: 600,
    displayFlags: {
      ...DEFAULT_DISPLAY_FLAGS,
      deflection: false, reactions: false, showExtremes: false,
      N: false, M: false, V: false, rotation: false,
      ...vlaggen,
    },
  }));
}

/** Alle snedetekens uit een gerenderde overlay, met hun padgetallen. */
function tekensUit(svg) {
  return [...svg.matchAll(/<path\b[^>]*><\/path>/g)]
    .map((m) => m[0])
    .filter((p) => p.includes("fem-diagram-teken"))
    .map((p) => ({
      soort: /fem-diagram-(M|V)\b/.exec(p)[1],
      getal: [...(/\bd="([^"]*)"/.exec(p)[1]).matchAll(/-?\d+(?:\.\d+)?/g)].map(Number),
    }))
    .sort((a, b) => a.getal[0] - b.getal[0]);
}

/** Buigteken: "M ax ay Q cx cy bx by". Een kwadratische bézier ligt op t = ½
 *  halverwege koorde en controlepunt, vandaar de weging ¼ ½ ¼. */
function boog(teken) {
  const [ax, ay, cx, cy, bx, by] = teken.getal;
  void cx;
  const topY = 0.25 * ay + 0.5 * cy + 0.25 * by;
  return {
    x: (ax + bx) / 2,
    koordeY: (ay + by) / 2,
    topY,
    dal: topY > ay,            // scherm-y groeit naar beneden: lager = dal (∪)
  };
}

/** Afschuifteken: twee pijlen van elk 10 padgetallen (staart, punt, weerhaken).
 *  Teruggegeven van links naar rechts op het scherm. */
function pijlen(teken) {
  const g = teken.getal;
  const maak = (o) => ({ x: g[o], staartY: g[o + 1], puntY: g[o + 3], omhoog: g[o + 3] < g[o + 1] });
  return [maak(0), maak(10)].sort((a, b) => a.x - b.x);
}

// ── Het startmodel en zijn houten ligger ──────────────────────────────────
const s = makeInitialSnapshot();
const model = {
  nodes: s.nodes, beams: s.beams, supports: s.supports, plates: s.plates,
  loadCases: DEFAULT_LOAD_CASES, loads: s.loads,
  // Uit: het eigen gewicht verandert de tekens niet, maar wel de getallen
  // waarmee deze test praat.
  selfWeightEnabled: false, scheefstandEnabled: false,
  scheefstandNoemer: 200, scheefstandRichting: 1,
};
const resultaat = solveAllCases(bouwMultiInput(model)).perCase.get(1); // permanent

// De houten ligger, zoals hij in het startmodel staat: knopen 5-6-7 op z = 0,
// twee staven, drie opleggingen. De ids staan hier expliciet zodat de test
// LUID omvalt als iemand het startmodel verbouwt — een stille verschuiving naar
// een andere staaf zou de tekens ergens anders toetsen dan bedoeld.
const HOUT_KNOPEN = [5, 6, 7];
const houtKnopen = s.nodes.filter((n) => HOUT_KNOPEN.includes(n.id));
const houtStaven = s.beams.filter((b) => HOUT_KNOPEN.includes(b.from) && HOUT_KNOPEN.includes(b.to));
const houtSteunen = s.supports.filter((sp) => HOUT_KNOPEN.includes(sp.nodeId));
const houtLasten = s.loads.filter(
  (l) => l.caseId === 1 && houtStaven.some((b) => b.id === l.beamId),
);

// ─────────────────────────────────────────────────────────────────────────
log("\n[a] Zone-indeling: tekenwissel, dode band, nulreeks");
{
  const z1 = bepaalTekenZones([3, 5, 4, 0, -2, -6], 0.5);
  check("aantal zones bij één tekenwissel", z1.length, 2);
  check("eerste zone positief", z1[0]?.teken, 1);
  check("eerste zone loopt tot vóór de nuldoorgang", z1[0]?.i1, 2);
  check("tweede zone negatief", z1[1]?.teken, -1);
  check("tweede zone begint na de nuldoorgang", z1[1]?.i0, 4);
  check("piek van de tweede zone", z1[1]?.piek, 6);

  // Afrondingsruis van een diagram dat overal nul is: geen enkele zone, dus
  // ook geen teken. Zonder dode band zou dit vier schijn-zones opleveren.
  const ruis = [1e-9, -2e-9, 3e-9, -1e-9];
  check("nulreeks levert geen zones", bepaalTekenZones(ruis, 1e-3 * 5).length, 0);
  check("lege reeks levert geen zones", bepaalTekenZones([], 1).length, 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[b] De houten ligger uit het startmodel wisselt van teken binnen één staaf");
{
  check("aantal houten staven", houtStaven.length, 2);
  ok("drie knopen op dezelfde hoogte", houtKnopen.every((n) => n.z === houtKnopen[0].z),
    "een doorgaande rechte ligger");
  check("aantal opleggingen onder de ligger", houtSteunen.length, 3);
  ok("beide staven belast in het permanente geval", houtLasten.length === 2);

  for (const b of houtStaven) {
    const ef = resultaat.elements.get(b.id);
    const M = ef.bendingMoment;
    const V = ef.shearForce;
    const drempel = Math.max(...M.map(Math.abs)) * 1e-3;
    ok(`staaf ${b.id}: M wisselt van teken`,
      M.some((m) => m > drempel) && M.some((m) => m < -drempel),
      `van ${(Math.max(...M) / 1e6).toFixed(2)} tot ${(Math.min(...M) / 1e6).toFixed(2)} kNm`);
    const vDrempel = Math.max(...V.map(Math.abs)) * 1e-3;
    ok(`staaf ${b.id}: V wisselt van teken`,
      V.some((v) => v > vDrempel) && V.some((v) => v < -vDrempel),
      `van ${(Math.max(...V) / 1000).toFixed(2)} tot ${(Math.min(...V) / 1000).toFixed(2)} kN`);
    // Sagging-positief: het veld trekt onder, het tussensteunpunt boven. De
    // staaf loopt van links naar rechts, dus het negatieve uiteinde is de kant
    // van knoop 6 (het middelste steunpunt).
    const bijSteunpunt = b.from === 6 ? M[0] : M[M.length - 1];
    ok(`staaf ${b.id}: moment boven het tussensteunpunt is negatief`,
      bijSteunpunt < -drempel, `${(bijSteunpunt / 1e6).toFixed(2)} kNm`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[c] Buigteken: dal in het veld, bult boven het steunpunt");
{
  const svg = rendereer({
    nodes: houtKnopen, beams: houtStaven, supports: houtSteunen,
    result: resultaat, vlaggen: { M: true },
  });
  const bogen = tekensUit(svg).map(boog);
  check("aantal buigtekens (twee velden + twee stukken steunpuntszone)", bogen.length, 4);

  // Van links naar rechts: veld (dal, onder de as), steunpunt links en rechts
  // (bult, boven de as), veld (dal, onder de as).
  const verwacht = [
    { naam: "veld links",              dal: true },
    { naam: "steunpunt, staaf links",  dal: false },
    { naam: "steunpunt, staaf rechts", dal: false },
    { naam: "veld rechts",             dal: true },
  ];
  bogen.forEach((b, i) => {
    ok(`${verwacht[i].naam}: boog is een ${verwacht[i].dal ? "dal (∪)" : "bult (∩)"}`,
      b.dal === verwacht[i].dal);
    // De momentenlijn ligt op de trekzijde: sagging ONDER de staaf (grotere
    // scherm-y), hogging erboven. Het teken hoort in zijn eigen lob te liggen.
    ok(`${verwacht[i].naam}: teken ligt in de lob (${verwacht[i].dal ? "onder" : "boven"} de as)`,
      verwacht[i].dal ? b.koordeY > AS_Y : b.koordeY < AS_Y,
      `koorde op y = ${b.koordeY.toFixed(1)}, as op ${AS_Y}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[d] Afschuifteken: bij V > 0 links omhoog en rechts omlaag");
{
  const svg = rendereer({
    nodes: houtKnopen, beams: houtStaven, supports: houtSteunen,
    result: resultaat, vlaggen: { V: true },
  });
  const tekens = tekensUit(svg);
  // Per staaf twee zones (V loopt van + naar − onder een neerwaartse last).
  check("aantal afschuiftekens", tekens.length, 4);

  const verwacht = [
    { naam: "staaf links, bij het buitenste steunpunt (V > 0)",  positief: true },
    { naam: "staaf links, bij het tussensteunpunt (V < 0)",      positief: false },
    { naam: "staaf rechts, bij het tussensteunpunt (V > 0)",     positief: true },
    { naam: "staaf rechts, bij het buitenste steunpunt (V < 0)", positief: false },
  ];
  tekens.forEach((t, i) => {
    const [links, rechts] = pijlen(t);
    const w = verwacht[i];
    ok(`${w.naam}: linker pijl ${w.positief ? "omhoog" : "omlaag"}`, links.omhoog === w.positief);
    ok(`${w.naam}: rechter pijl ${w.positief ? "omlaag" : "omhoog"}`, rechts.omhoog === !w.positief);
    ok(`${w.naam}: de twee pijlen wijzen tegengesteld`, links.omhoog !== rechts.omhoog);
    // De dwarskrachtlijn wordt met haar eigen teken uitgezet: de positieve lob
    // ligt aan lokale +y, voor deze staven dus BOVEN de as.
    const hart = (links.staartY + links.puntY) / 2;
    ok(`${w.naam}: teken ligt in de lob (${w.positief ? "boven" : "onder"} de as)`,
      w.positief ? hart < AS_Y : hart > AS_Y, `hart op y = ${hart.toFixed(1)}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[e] Omgekeerde knoopvolgorde geeft hetzelfde beeld");
{
  // Dezelfde ligger, één keer met from→to zoals in het startmodel en één keer
  // omgedraaid. Fysisch is dat hetzelfde bouwwerk, dus het beeld op het scherm
  // hoort niet te veranderen — terwijl de LOKALE assen van elke staaf wél
  // omklappen. Een teken dat aan die assen hangt zonder de omklap mee te nemen,
  // valt hier om.
  const sec = resolveSection(houtStaven[0].material, houtStaven[0].profile);
  const bouw = (omgekeerd) => ({
    nodes: houtKnopen,
    beams: houtStaven.map((b) => ({
      id: b.id,
      from: omgekeerd ? b.to : b.from,
      to: omgekeerd ? b.from : b.to,
      E: sec.E, A: sec.A, I: sec.I,
    })),
    supports: houtSteunen,
    loads: houtLasten.map((l) => ({ beamId: l.beamId, q: l.q })),
  });
  const beeld = (omgekeerd, vlaggen) => {
    const invoer = bouw(omgekeerd);
    const svg = rendereer({
      nodes: houtKnopen, beams: invoer.beams, supports: houtSteunen,
      result: solve(invoer), vlaggen,
    });
    return tekensUit(svg);
  };

  const mNormaal = beeld(false, { M: true }).map(boog);
  const mOmgekeerd = beeld(true, { M: true }).map(boog);
  check("evenveel buigtekens", mOmgekeerd.length, mNormaal.length);
  mNormaal.forEach((b, i) => {
    const o = mOmgekeerd[i];
    ok(`buigteken ${i + 1} staat op dezelfde plek`, o && Math.abs(o.x - b.x) < 1,
      `x = ${b.x.toFixed(1)} vs ${o?.x.toFixed(1)}`);
    ok(`buigteken ${i + 1} bolt dezelfde kant op`, o && o.dal === b.dal);
  });

  const vNormaal = beeld(false, { V: true }).map(pijlen);
  const vOmgekeerd = beeld(true, { V: true }).map(pijlen);
  check("evenveel afschuiftekens", vOmgekeerd.length, vNormaal.length);
  vNormaal.forEach((p, i) => {
    const o = vOmgekeerd[i];
    ok(`afschuifteken ${i + 1} wijst dezelfde kant op`,
      o && o[0].omhoog === p[0].omhoog && o[1].omhoog === p[1].omhoog,
      `links ${p[0].omhoog ? "omhoog" : "omlaag"}, rechts ${p[1].omhoog ? "omhoog" : "omlaag"}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[f] Terughoudend: alleen bij V en M, alleen als de gebruiker ze wil, alleen als ze passen");
{
  const basis = {
    nodes: houtKnopen, beams: houtStaven, supports: houtSteunen, result: resultaat,
  };
  check("N krijgt geen snedeteken",
    tekensUit(rendereer({ ...basis, vlaggen: { N: true } })).length, 0);
  check("θ krijgt geen snedeteken",
    tekensUit(rendereer({ ...basis, vlaggen: { rotation: true } })).length, 0);
  check("uitgezet door de gebruiker: geen enkel teken",
    tekensUit(rendereer({ ...basis, vlaggen: { M: true, V: true, snedeTekens: false } })).length, 0);
  // Kleinste schaalstand van de regelaar: de lob is dan te ondiep om er een
  // leesbaar teken in te zetten, dus komt er geen.
  check("te ondiepe lob: geen teken",
    tekensUit(rendereer({ ...basis, vlaggen: { M: true, scaleM: 0.1 } })).length, 0);
  ok("bij de standaardschaal staan ze er wél",
    tekensUit(rendereer({ ...basis, vlaggen: { M: true } })).length > 0);
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${failed === 0 ? "ALLES GOED" : "MISLUKT"} — ${passed} geslaagd, ${failed} mislukt`);
process.exit(failed === 0 ? 0 : 1);
