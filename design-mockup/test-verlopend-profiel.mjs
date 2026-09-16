// Verlopende profielen — deel 1: model, doorsnede op positie x, solver.
//
// WAT HIER BEWEZEN WORDT
//   [1] Prismatisch-gelijkheid: zonder `profileEnd`, met `profileEnd` gelijk
//       aan `profile` en met hetzelfde profiel in een andere schrijfwijze is
//       de solverinvoer byte-gelijk en de uitkomst bit-gelijk.
//   [2] Doorsnedetabel: rechthoek en gelast I-profiel op t = 0, ½ en 1 tegen
//       de hand.
//   [3] Uitkrager met puntlast aan de tip en lineair verlopende hoogte tegen
//       de gesloten oplossing van ∫ M·m/(E·I(x)) dx; momentenlijn exact.
//   [4] Ingeklemd-opgelegde ligger onder q met verlopende hoogte: de
//       oplegreactie tegen de gesloten oplossing (statisch onbepaald, dus de
//       stijfheidsverdeling telt).
//   [5] Eigen gewicht van een verlopende staaf = gemiddelde A · ρ · g · L.
//   [6] Convergentie over het aantal segmenten.
//   [7] Weigeringen met reden: andere doorsnedesoort, koker, beton, eigen
//       doorsnede, onbekend eindprofiel, geen materiaal, platen.
//   [8] Poorten: valideerModel/controleerVelden, projectbestand,
//       referentierichting en de in-proces sidecar (MCP-weg).
//
// ── ANALYTISCHE REFERENTIES (alles met de hand) ──────────────────────────────
//
// Rechthoek b × h(x), b constant, hoogte lineair van h0 naar h1 over L. Meet u
// vanaf het einde met hoogte h1: h(u) = h1·(1 + k·u) met k = (h0 − h1)/(h1·L),
// I(u) = b·h1³·(1 + k·u)³/12. Met r = h0/h1 en s = 1 + k·u (s loopt van 1 tot r,
// du = ds/k) zijn de twee integralen die hieronder nodig zijn:
//
//   J2 = ∫₀^L u²/(1+ku)³ du = (1/k³)·∫₁^r (s−1)²/s³ ds
//      = (1/k³)·∫₁^r (1/s − 2/s² + 1/s³) ds
//      = (1/k³)·[ln s + 2/s − 1/(2s²)]₁^r
//      = (1/k³)·[ln r + 2/r − 1/(2r²) − 3/2]
//   J3 = ∫₀^L u³/(1+ku)³ du = (1/k⁴)·∫₁^r (s−1)³/s³ ds
//      = (1/k⁴)·∫₁^r (1 − 3/s + 3/s² − 1/s³) ds
//      = (1/k⁴)·[s − 3 ln s − 3/s + 1/(2s²)]₁^r
//      = (1/k⁴)·[r − 3 ln r − 3/r + 1/(2r²) + 3/2]
//
//   Limietcontrole r → 1 (prismatisch), r = 1 + ε, ε = kL: de reeksen van
//   ln(1+ε), 1/(1+ε) en 1/(1+ε)² geven J2 → ε³/(3k³) = L³/3 en
//   J3 → ε⁴/(4k⁴) = L⁴/4 — precies ∫u² du en ∫u³ du. De formules kloppen dus
//   in de limiet waarin ze de klassieke waarden moeten geven.
//
// [3] UITKRAGER, ingeklemd waar h = h0, puntlast P aan de tip (h = h1):
//     M(u) = P·u, eenheidslast aan de tip geeft m(u) = u, dus
//     δ_tip = ∫ M·m/(EI) du = (12·P/(E·b·h1³))·J2
//     Controle r → 1: (12P/(E b h1³))·(L³/3) = P·L³/(3·E·I1)  ✓ klassiek.
//     De momentenlijn is statisch bepaald en hangt niet van I af: |M| = P·(L−x).
//
// [4] INGEKLEMD-OPGELEGD, inklemming waar h = h0, rol B waar h = h1, UDL q:
//     laat de rol los (uitkrager vanaf de inklemming) en eis δ_B = 0:
//       δ_B(q) = ∫ (q·u²/2)·u/(EI) du = (q/2)·(12/(E b h1³))·J3
//       δ_B(R) = ∫ (R·u)·u/(EI) du   =  R  ·(12/(E b h1³))·J2
//     ⇒ R_B = (q/2)·J3/J2
//     Controle r → 1: (q/2)·(L⁴/4)/(L³/3) = 3qL/8  ✓ klassiek.
//     Uit het evenwicht daarna: M_A = q·L²/2 − R_B·L (inklemmingsmoment).
//
// [5] EIGEN GEWICHT: A(x) = b·h(x) is lineair in x als b constant is; de
//     middenregel is exact voor een lineaire functie, dus de som over de
//     segmenten Σ ρ·g·A(mid_i)·ℓ_i = ρ·g·b·(h0+h1)/2·L, ongeacht het aantal
//     segmenten. De verticale oplegreacties sommeren tot dat gewicht.
//
// [2] DOORSNEDETABEL (mm, mm², mm⁴):
//     rechthoek "100x300" → "100x200":
//       t=0:  A = 100·300 = 30 000;  I = 100·300³/12 = 225 000 000
//       t=½:  h = 250; A = 25 000;   I = 100·250³/12 = 130 208 333,33
//       t=1:  A = 20 000;            I = 100·200³/12 =  66 666 666,67
//     rechthoek "150x300" → "100x200" (b verloopt óók):
//       t=½:  b = 125, h = 250; A = 31 250; I = 125·250³/12 = 162 760 416,67
//     gelast I "IPE300" → "IPE200" (catalogusmaten: IPE 300 h300 b150 tw7,1
//     tf10,7; IPE 200 h200 b100 tw5,6 tf8,5), A = 2·b·tf + (h−2tf)·tw,
//     I = [b·h³ − (b−tw)·(h−2tf)³]/12:
//       t=0:  A = 2·150·10,7 + 278,6·7,1 = 3210 + 1978,06 = 5 188,06
//             I = (150·300³ − 142,9·278,6³)/12
//               = (4 050 000 000 − 142,9·21 624 363,66)/12
//               = (4 050 000 000 − 3 090 121 567)/12 = 79 989 869
//       t=½:  h250 b125 tw6,35 tf9,6: A = 2400 + 230,8·6,35 = 3 865,58
//             I = (125·250³ − 118,65·230,8³)/12
//               = (1 953 125 000 − 118,65·12 294 402,1)/12
//               = (1 953 125 000 − 1 458 730 810)/12 = 41 199 516
//       t=1:  A = 2·100·8,5 + 183·5,6 = 1700 + 1024,8 = 2 724,8
//             I = (100·200³ − 94,4·183³)/12 = (800 000 000 − 94,4·6 128 487)/12
//               = (800 000 000 − 578 529 173)/12 = 18 455 902
//
// Draaien met: npx tsx test-verlopend-profiel.mjs
//         of : node scripts/run-tests.mjs --filter=verlopend-profiel

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const {
  bepaalVerloop, doorsnedeOpPositie, dichtheidVanMateriaal, DoorsnedeOnbekendFout, G,
} = await import("./src/lib/sectionResolver.ts");
const {
  bouwMultiInput, controleerDoorsneden, doorsnedeVeldenVoorSolver, eigenGewichtLasten,
  segmentenVoorVerloop, aantalVerloopSegmenten, VERLOOP_SEGMENTEN,
} = await import("./src/lib/modelNaarSolverInput.ts");
const { controleerVelden, valideerModel } = await import("./src/mcp/valideerModel.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");
const { staafInReferentierichting } = await import("./src/lib/referentierichting.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
}
/** Relatieve vergelijking; drukt de gemeten afwijking altijd af. */
function rel(naam, gemeten, verwacht, tolRel) {
  const afw = Math.abs(gemeten - verwacht) / Math.max(Math.abs(verwacht), 1e-300);
  ok(naam, Number.isFinite(gemeten) && afw <= tolRel,
    `${gemeten.toPrecision(7)} vs ${verwacht.toPrecision(7)}, afwijking ${(afw * 100).toExponential(2)} %`);
  return afw;
}
function gooit(naam, fn, woord) {
  try { fn(); ok(naam, false, "geen uitzondering"); }
  catch (e) { ok(naam, e instanceof DoorsnedeOnbekendFout && e.message.includes(woord), e.message.slice(0, 140)); }
}

const GEVAL_G = { id: 1, name: "G", type: "dead" };
const basisModel = (extra) => ({
  supports: [], plates: [], loadCases: [GEVAL_G], loads: [],
  selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Prismatisch-gelijkheid: geen, gelijk of anders gespeld eindprofiel");
// ─────────────────────────────────────────────────────────────────────────
{
  const portaal = (staalEind, houtEind) => basisModel({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }, { id: 3, x: 5000, z: 3000 }, { id: 4, x: 5000, z: 0 }],
    beams: [
      { id: 1, from: 1, to: 2, material: "S235", profile: "IPE300", ...(staalEind !== undefined ? { profileEnd: staalEind } : {}) },
      { id: 2, from: 2, to: 3, material: "C24", profile: "100x300", ...(houtEind !== undefined ? { profileEnd: houtEind } : {}) },
      { id: 3, from: 3, to: 4, material: "S235", profile: "IPE300" },
    ],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "pinned" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 2, q: -8 }],
    selfWeightEnabled: true,
  });
  const referentie = JSON.stringify(bouwMultiInput(portaal(undefined, undefined)));
  ok("zonder eindprofiel: geen `segmenten`-sleutel en één eigengewichtslast per staaf",
    !referentie.includes("segmenten") && !referentie.includes("startFrac"));
  for (const [naam, s, h] of [
    ["gelijk", "IPE300", "100x300"],
    ["leeg", "", ""],
    ["anders gespeld", "IPE 300", "100 x 300"],
  ]) {
    ok(`eindprofiel ${naam}: solverinvoer byte-gelijk`, JSON.stringify(bouwMultiInput(portaal(s, h))) === referentie);
  }
  const uit = (m) => {
    const r = solveAllCases(bouwMultiInput(m)).perCase.get(1);
    return JSON.stringify({ d: [...r.displacements], re: [...r.reactions], el: [...r.elements] });
  };
  ok("uitkomst bit-gelijk met en zonder het veld", uit(portaal("IPE 300", "100x300")) === uit(portaal(undefined, undefined)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Doorsnede op positie t tegen de hand");
// ─────────────────────────────────────────────────────────────────────────
{
  const v1 = bepaalVerloop("C24", "100x300", "100x200");
  ok("rechthoek → rechthoek is verlopend", v1.status === "verlopend" && v1.verloop.soort === "rechthoek");
  const d = (v, t) => doorsnedeOpPositie(v.verloop, t);
  rel("rechthoek t=0 A", d(v1, 0).A, 30000, 1e-12);
  rel("rechthoek t=0 I", d(v1, 0).I, 225e6, 1e-12);
  rel("rechthoek t=½ A", d(v1, 0.5).A, 25000, 1e-12);
  rel("rechthoek t=½ I = 100·250³/12", d(v1, 0.5).I, 100 * 250 ** 3 / 12, 1e-12);
  rel("rechthoek t=1 A", d(v1, 1).A, 20000, 1e-12);
  rel("rechthoek t=1 I", d(v1, 1).I, 100 * 200 ** 3 / 12, 1e-12);
  ok("E van het materiaal (C24: 11 000)", v1.verloop.E === 11000);
  const v2 = bepaalVerloop("C24", "150x300", "100x200");
  rel("b én h verlopen, t=½: A = 125·250", d(v2, 0.5).A, 31250, 1e-12);
  rel("b én h verlopen, t=½: I = 125·250³/12", d(v2, 0.5).I, 125 * 250 ** 3 / 12, 1e-12);

  const v3 = bepaalVerloop("S235", "IPE300", "IPE200");
  ok("IPE → IPE is verlopend, gelast I", v3.status === "verlopend" && v3.verloop.soort === "gelastI");
  const m0 = d(v3, 0), mh = d(v3, 0.5), m1 = d(v3, 1);
  rel("gelast I t=0 A = 5 188,06", m0.A, 5188.06, 1e-9);
  rel("gelast I t=0 I", m0.I, (150 * 300 ** 3 - 142.9 * 278.6 ** 3) / 12, 1e-12);
  ok("gelast I t=0 wijkt bewust af van de catalogus (geen uitronding): 5 188 < 5 380",
    m0.A < 5380 && m0.A > 5100);
  ok("gelast I t=½ maten h250 b125 tw6,35 tf9,6",
    mh.maten.h === 250 && mh.maten.b === 125 && Math.abs(mh.maten.tw - 6.35) < 1e-12 && Math.abs(mh.maten.tf - 9.6) < 1e-12);
  rel("gelast I t=½ A = 3 865,58", mh.A, 3865.58, 1e-9);
  rel("gelast I t=½ I", mh.I, (125 * 250 ** 3 - 118.65 * 230.8 ** 3) / 12, 1e-12);
  rel("gelast I t=1 A = 2 724,8", m1.A, 2724.8, 1e-9);
  rel("gelast I t=1 I", m1.I, (100 * 200 ** 3 - 94.4 * 183 ** 3) / 12, 1e-12);
  ok("I ↔ H mag (dezelfde soort)", bepaalVerloop("S235", "IPE300", "HEA200").status === "verlopend");
  ok("gespiegeld verloop: t=0 van IPE200→IPE300 is t=1 van de omkering",
    Math.abs(doorsnedeOpPositie(bepaalVerloop("S235", "IPE200", "IPE300").verloop, 0).A - m1.A) < 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Uitkrager, puntlast aan de tip, hoogte 400 → 200 (C24, b = 100, L = 3000)");
// ─────────────────────────────────────────────────────────────────────────
const J2 = (r, k) => (Math.log(r) + 2 / r - 1 / (2 * r * r) - 1.5) / k ** 3;
const J3 = (r, k) => (r - 3 * Math.log(r) - 3 / r + 1 / (2 * r * r) + 1.5) / k ** 4;
/** Simpson met n (even) stukken van f over [0, L]: onafhankelijke controle van de gesloten vormen. */
const simpson = (f, L, n = 2000) => {
  const h = L / n;
  let s = f(0) + f(L);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(i * h);
  return (s * h) / 3;
};
{
  const L = 3000, P = 10; // kN, omlaag
  const h0 = 400, h1 = 200, b = 100, E = 11000;
  const r = h0 / h1, k = (h0 - h1) / (h1 * L);
  const dTip = (12 * P * 1000 / (E * b * h1 ** 3)) * J2(r, k);
  // De gesloten vormen J2 en J3 zelf, los van de solver: (a) tegen een
  // numerieke integraal bij r = 2; (b) de prismatische limiet r → 1. Bij (b)
  // is de afwijking O(ε) door de afgekapte reeks, en de haakjes lopen op
  // uitdoving (ε³ resp. ε⁴ van orde-1-termen), dus ε niet kleiner dan 1e-3
  // (J2) en 1e-2 (J3).
  rel("J2(r=2) ≡ ∫u²/(1+ku)³ du (Simpson)", J2(r, k), simpson((u) => u * u / (1 + k * u) ** 3, L), 1e-9);
  rel("J3(r=2) ≡ ∫u³/(1+ku)³ du (Simpson)", J3(r, k), simpson((u) => u ** 3 / (1 + k * u) ** 3, L), 1e-9);
  rel("J2(r→1) → L³/3", J2(1 + 1e-3, 1e-3 / L), L ** 3 / 3, 5e-3);
  rel("J3(r→1) → L⁴/4", J3(1 + 1e-2, 1e-2 / L), L ** 4 / 4, 5e-2);

  const model = basisModel({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: `${b}x${h0}`, profileEnd: `${b}x${h1}` }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [{ id: 1, type: "pointForce", caseId: 1, nodeId: 2, fz: -P }],
  });
  const mi = bouwMultiInput(model);
  ok(`mapping: ${VERLOOP_SEGMENTEN} segmenten met A én I`,
    mi.beams[0].segmenten?.length === VERLOOP_SEGMENTEN && mi.beams[0].segmenten.every((s) => s.A > 0 && s.I > 0));
  ok("mapping: A en I van de staaf zelf zijn die van het midden (h = 300)",
    mi.beams[0].A === b * 300 && mi.beams[0].I === b * 300 ** 3 / 12);
  const res = solveAllCases(mi).perCase.get(1);
  const el = res.elements.get(1);
  ok("resultaat: 20 rekenstukken × 21 stations = 420 stations", el.stations_mm.length === 420, `${el.stations_mm.length}`);
  ok("resultaat: `segmenten` met A per stuk, I dalend van begin naar eind",
    el.segmenten?.length === 20 && el.segmenten.every((s) => s.A > 0) &&
      el.segmenten.every((s, i) => i === 0 || s.I < el.segmenten[i - 1].I));
  const wTip = el.deflection[el.deflection.length - 1];
  const afw = rel("zakking tip tegen (12P/(E·b·h1³))·J2, < 1 %", Math.abs(wTip), dTip, 0.01);
  ok("zakking tip: afwijking < 0,2 % (trapsgewijze benadering met 20 stukken)", afw < 0.002);
  ok("zakking omlaag (lokaal −y)", wTip < 0);
  // Momentenlijn: statisch bepaald, dus op ELK van de 420 stations exact P·(L−x).
  let maxAfwM = 0;
  for (let i = 0; i < el.stations_mm.length; i++) {
    const verwacht = P * 1000 * (L - el.stations_mm[i]);
    maxAfwM = Math.max(maxAfwM, Math.abs(Math.abs(el.bendingMoment[i]) - verwacht) / (P * 1000 * L));
  }
  ok("momentenlijn |M(x)| = P·(L−x) op alle 420 stations (rel. 1e-9)", maxAfwM < 1e-9, `max ${maxAfwM.toExponential(2)}`);
  rel("inklemmingsmoment |M_A| = P·L", Math.abs(res.reactions.get(1).my), P * 1000 * L, 1e-9);
  rel("verticale reactie = P", res.reactions.get(1).fz, P * 1000, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Ingeklemd-opgelegde ligger, q = 10 kN/m, hoogte 400 (inklemming) → 200 (rol), L = 4000");
// ─────────────────────────────────────────────────────────────────────────
{
  const L = 4000, q = 10; // kN/m = N/mm, omlaag
  const h0 = 400, h1 = 200, b = 100;
  const r = h0 / h1, k = (h0 - h1) / (h1 * L);
  const R_B = (q / 2) * J3(r, k) / J2(r, k);           // N
  const M_A = q * L * L / 2 - R_B * L;                 // N·mm, inklemmingsmoment
  rel("J3/J2 (r→1) → 3L/4, dus R_B → 3qL/8", J3(1 + 1e-2, 1e-2 / L) / J2(1 + 1e-2, 1e-2 / L), 0.75 * L, 5e-2);
  ok("verlopend: de rol draagt minder dan 3qL/8 (de zware kant is de inklemming)", R_B < 3 * q * L / 8,
    `R_B = ${(R_B / 1000).toFixed(3)} kN tegen 15 kN prismatisch`);

  const model = basisModel({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "C24", profile: `${b}x${h0}`, profileEnd: `${b}x${h1}` }],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -q }],
  });
  const res = solveAllCases(bouwMultiInput(model)).perCase.get(1);
  const afwR = rel("R_B tegen (q/2)·J3/J2, < 1 %", res.reactions.get(2).fz, R_B, 0.01);
  ok("R_B: afwijking < 0,2 %", afwR < 0.002);
  rel("R_A = qL − R_B", res.reactions.get(1).fz, q * L - R_B, 0.002);
  rel("|M_A| = qL²/2 − R_B·L", Math.abs(res.reactions.get(1).my), M_A, 0.005);
  ok("zakking op de rol is nul", Math.abs(res.elements.get(1).deflection.at(-1)) < 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Eigen gewicht van een verlopende staaf = gemiddelde A · ρ · g · L");
// ─────────────────────────────────────────────────────────────────────────
{
  const L = 3000, b = 100, h0 = 400, h1 = 200;
  const rho = dichtheidVanMateriaal("C24");
  ok("ρ C24 = 420 kg/m³ (EN 338 tabel 1)", rho === 420);
  const W = rho * (b * (h0 + h1) / 2 * 1e-6) * G * (L / 1000); // N
  const beam = { id: 1, from: 1, to: 2, material: "C24", profile: `${b}x${h0}`, profileEnd: `${b}x${h1}` };
  const lasten = eigenGewichtLasten(beam, L, 1);
  ok("per segment één deellast op de segmentfracties", lasten.length === 20 &&
    lasten.every((l, i) => l.startFrac === i / 20 && l.endFrac === (i + 1) / 20 && l.q < 0));
  const som = lasten.reduce((s, l) => s + -l.q * (l.endFrac - l.startFrac) * L, 0); // kN/m·mm = N
  rel("Σ q_i·ℓ_i = ρ·g·b·(h0+h1)/2·L (middenregel exact voor lineaire A)", som, W, 1e-12);
  ok("het zware einde weegt het meest: q(segment 1) > q(segment 20)", -lasten[0].q > -lasten[19].q);

  const model = basisModel({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [beam],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    selfWeightEnabled: true,
  });
  const mi = bouwMultiInput(model);
  ok("mapping: 20 eigengewichtslasten in het blijvende geval", mi.loads.length === 20 && mi.loads.every((l) => l.caseId === 1));
  const res = solveAllCases(mi).perCase.get(1);
  const RA = res.reactions.get(1).fz, RB = res.reactions.get(2).fz;
  rel("R_A + R_B = gewicht", RA + RB, W, 1e-9);
  ok("R_A (zware kant) > R_B", RA > RB, `${RA.toFixed(3)} > ${RB.toFixed(3)} N`);
  // Lineair verlopende lijnlast w(x) van w0 naar w1 op twee steunpunten:
  // R_A = L·(2w0 + w1)/6, R_B = L·(w0 + 2w1)/6. De trap van 20 stukken wijkt
  // daar iets van af; met 1 % marge moet het kloppen.
  const w0 = rho * (b * h0 * 1e-6) * G / 1000, w1 = rho * (b * h1 * 1e-6) * G / 1000; // N/mm
  rel("R_A ≈ L(2w0+w1)/6", RA, L * (2 * w0 + w1) / 6, 0.01);
  rel("R_B ≈ L(w0+2w1)/6", RB, L * (w0 + 2 * w1) / 6, 0.01);
  // Zonder blijvend geval geen eigen gewicht — ook niet per segment.
  const zonder = bouwMultiInput({ ...model, loadCases: [{ id: 1, name: "Q", type: "live" }] });
  ok("geen blijvend geval → geen eigengewichtslasten", zonder.loads.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Convergentie over het aantal segmenten (uitkrager uit [3])");
// ─────────────────────────────────────────────────────────────────────────
{
  const L = 3000, P = 10000, h0 = 400, h1 = 200, b = 100, E = 11000;
  const r = h0 / h1, k = (h0 - h1) / (h1 * L);
  const dTip = (12 * P / (E * b * h1 ** 3)) * J2(r, k);
  const verloop = bepaalVerloop("C24", `${b}x${h0}`, `${b}x${h1}`).verloop;
  const fout = (n) => {
    const seg = segmentenVoorVerloop(verloop, L, n);
    const res = solveAllCases({
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
      beams: [{ id: 1, from: 1, to: 2, E, A: b * 300, I: b * 300 ** 3 / 12, segmenten: seg }],
      supports: [{ nodeId: 1, type: "fixed" }],
      loads: [], pointLoads: [{ nodeId: 2, fz: -P, caseId: 1 }],
      cases: [{ id: 1, name: "LC1" }],
    }).perCase.get(1);
    return Math.abs(Math.abs(res.elements.get(1).deflection.at(-1)) - dTip) / dTip;
  };
  const reeks = [2, 5, 10, 20, 40].map((n) => ({ n, e: fout(n) }));
  log("    n   afwijking zakking tip");
  for (const { n, e } of reeks) log(`    ${String(n).padStart(2)}  ${(e * 100).toExponential(3)} %`);
  ok("de afwijking daalt bij elke verfijning", reeks.every((p, i) => i === 0 || p.e < reeks[i - 1].e));
  ok("met 2 stukken zit hij er nog meer dan 1 % naast (de trap is grof)", reeks[0].e > 0.01);
  ok("met 20 stukken (de standaard) < 1 %", reeks[3].e < 0.01);
  ok("halvering van de stuklengte (20 → 40) deelt de fout door ≥ 3 (tweede-orde benadering)",
    reeks[3].e / reeks[4].e >= 3, `${(reeks[3].e / reeks[4].e).toFixed(2)}`);
  ok("korte staaf: 300 mm → 12 stukken van 25 mm, nooit korter", aantalVerloopSegmenten(300) === 12 && aantalVerloopSegmenten(10) === 1);
  ok("lange staaf: 20 stukken", aantalVerloopSegmenten(12000) === 20);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Weigeringen met reden");
// ─────────────────────────────────────────────────────────────────────────
{
  const fout = (naam, m, p, e, woord) => {
    const v = bepaalVerloop(m, p, e);
    ok(naam, v.status === "fout" && v.reden.includes(woord), v.status === "fout" ? v.reden.slice(0, 120) : v.status);
  };
  fout("hout: rechthoek → I-profiel", "C24", "100x300", "IPE200", "rechthoek");
  fout("staal: I-profiel → rechthoek", "S235", "IPE300", "100x200", "dezelfde doorsnedesoort");
  fout("staal: I → koker", "S235", "IPE300", "HFRHS200X200X16", "niet ondersteund");
  fout("staal: koker → koker", "S235", "SHS100X100X5", "SHS80X80X4", "koker");
  fout("staal: buis → buis", "S235", "CHS424X32", "CHS483X32", "buis");
  fout("staal: I → I met toelopende flenzen (INP)", "S235", "IPE300", "INP300", "toelopende flenzen");
  fout("staal: onbekend eindprofiel", "S235", "IPE300", "IPE999", "niet bekend in de staalcatalogus");
  fout("beton", "C30/37", "300x500", "300x400", "beton");
  fout("kruislaaghout", "C24", "CLT 5s 100", "CLT 3s 60", "kruislaaghout");
  fout("eigen doorsnede", "S235", "EIGEN:mijn", "IPE200", "eigen doorsnede");
  fout("geen materiaal", undefined, "100x300", "100x200", "geen materiaal");
  ok("vrij materiaal met rechthoek mag", bepaalVerloop("VRIJ:steen E=20000 rho=2600 f=10", "100x300", "100x200").status === "verlopend");

  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 }];
  const fouteStaaf = { id: 7, from: 1, to: 2, material: "C24", profile: "100x300", profileEnd: "IPE200" };
  gooit("controleerDoorsneden meldt het eindprofiel met staafnummer", () => controleerDoorsneden([fouteStaaf]), "staaf 7");
  gooit("doorsnedeVeldenVoorSolver valt niet stil terug op het beginprofiel",
    () => doorsnedeVeldenVoorSolver(fouteStaaf, 3000), "Staaf 7");
  const goed = { id: 1, from: 1, to: 2, material: "C24", profile: "100x300", profileEnd: "100x200" };
  controleerDoorsneden([goed]);
  ok("controleerDoorsneden zonder platen: verlopend mag", true);
  gooit("controleerDoorsneden met platen: verlopend geweigerd met reden",
    () => controleerDoorsneden([goed], { heeftPlaten: true }), "platen");
  const metPlaat = basisModel({
    nodes: [...nodes, { id: 3, x: 3000, z: 2000 }, { id: 4, x: 0, z: 2000 }],
    beams: [goed],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4] }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
  });
  gooit("bouwMultiInput met platen en verloop: geweigerd", () => bouwMultiInput(metPlaat), "platen");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Poorten: validatie, projectbestand, referentierichting, sidecar");
// ─────────────────────────────────────────────────────────────────────────
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }];
  const model = (staaf) => ({
    nodes, beams: [staaf],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loadCases: [GEVAL_G],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -5 }],
  });
  const goed = { id: 1, from: 1, to: 2, material: "C24", profile: "100x400", profileEnd: "100x200" };
  ok("controleerVelden: `profileEnd` is een bekend staafveld", controleerVelden(model(goed)).length === 0,
    controleerVelden(model(goed)).join("; "));
  const typefout = controleerVelden(model({ ...goed, profileEnd: 200 }));
  ok("controleerVelden: `profileEnd` moet tekst zijn", typefout.some((f) => f.includes("profileEnd") && f.includes("tekst")));
  const tik = controleerVelden(model({ id: 1, from: 1, to: 2, material: "C24", profile: "100x400", profilEnd: "100x200" }));
  ok("controleerVelden: tikfout `profilEnd` → hint naar `profileEnd`", tik.some((f) => f.includes("Bedoelde u `profileEnd`")));
  const v = valideerModel(model(goed));
  ok("valideerModel: verlopende houten ligger is geldig", v.ok === true, v.errors.join("; "));
  const vf = valideerModel(model({ ...goed, profileEnd: "IPE200" }));
  ok("valideerModel: eindprofiel van een andere soort is een fout met staafnummer",
    vf.ok === false && vf.errors.some((e) => e.includes("Staaf 1") && e.includes("rechthoek")), vf.errors.join("; "));
  const vp = valideerModel({
    ...model(goed),
    nodes: [...nodes, { id: 3, x: 4000, z: 2000 }, { id: 4, x: 0, z: 2000 }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4] }],
  });
  ok("valideerModel: verloop met platen is een fout", vp.ok === false && vp.errors.some((e) => e.includes("platen")), vp.errors.join("; "));

  // Projectbestand: het veld reist mee, en ontbreekt bij een prismatische staaf.
  const tekst = serializeProject({
    nodes, beams: [goed, { id: 2, from: 1, to: 2, material: "S235", profile: "IPE200" }],
    supports: [], plates: [], loads: [], loadCases: [GEVAL_G], activeLoadCaseId: 1, combinations: [],
  });
  const terug = deserializeProject(tekst);
  ok("projectbestand: formaatversie blijft 2", terug.version === 2);
  ok("projectbestand: profileEnd overleeft opslaan en openen", terug.beams[0].profileEnd === "100x200" && terug.beams[0].profile === "100x400");
  ok("projectbestand: prismatische staaf zonder het veld", !("profileEnd" in terug.beams[1]) && (tekst.match(/profileEnd/g) ?? []).length === 1);

  // Referentierichting: van rechts naar links getekend → gespiegeld, begin en eind wisselen.
  const links = staafInReferentierichting({ ...goed, from: 2, to: 1 }, nodes);
  ok("referentierichting: gespiegelde staaf wisselt begin- en eindprofiel",
    links.from === 1 && links.to === 2 && links.profile === "100x200" && links.profileEnd === "100x400");
  const zelfde = staafInReferentierichting(goed, nodes);
  ok("referentierichting: al goed getekend → hetzelfde object", zelfde === goed);
  const prism = staafInReferentierichting({ id: 3, from: 2, to: 1, material: "C24", profile: "100x400" }, nodes);
  ok("referentierichting: prismatische staaf krijgt geen profileEnd", !("profileEnd" in prism));

  // Sidecar (MCP-weg, in-proces): dezelfde reacties als de app, en dezelfde weigering.
  const m = { ...model(goed), plates: [], selfWeightEnabled: true, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1 };
  const antw = verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model: m } });
  ok("sidecar solve met verlopende staaf slaagt", antw.ok === true, antw.error?.melding ?? "");
  const app = solveAllCases(bouwMultiInput(m)).perCase.get(1);
  for (const knoop of [1, 2]) {
    rel(`sidecar: R_z knoop ${knoop} ≡ app (kN)`, antw.result?.per_case?.["1"]?.reactions?.[String(knoop)]?.fz ?? NaN, app.reactions.get(knoop).fz / 1000, 1e-12);
  }
  ok("sidecar: de reacties zijn ongelijk (zware kant draagt meer)", app.reactions.get(1).fz > app.reactions.get(2).fz);
  const weiger = verwerkVerzoek({ v: 1, id: 2, op: "solve", payload: { model: { ...m, beams: [{ ...goed, profileEnd: "IPE200" }] } } });
  ok("sidecar: fout eindprofiel → INVOER_ONGELDIG of DOORSNEDE_ONBEKEND met de reden",
    weiger.ok === false && ["INVOER_ONGELDIG", "DOORSNEDE_ONBEKEND"].includes(weiger.error?.code) && /rechthoek/.test(weiger.error?.melding ?? ""),
    `${weiger.error?.code}: ${(weiger.error?.melding ?? "").slice(0, 120)}`);
}

log(`\n${failed === 0 ? "GESLAAGD" : "GEFAALD"}: ${passed} geslaagd, ${failed} gefaald.`);
process.exit(failed === 0 ? 0 : 1);
