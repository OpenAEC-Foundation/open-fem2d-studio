// Staafsegmenten met een eigen buigstijfheid (fase D, stap 10 + 11).
//
// Bewijst dat één UI-staaf die uit segmenten met elk een eigen I bestaat
// hetzelfde doet als de analytische oplossing, en dat de bestaande mechaniek
// (deellasten, staafpuntlasten, scharnieren, stations) er ongeschonden
// doorheen komt.
//
// ── ANALYTISCHE REFERENTIES (eenheidslastmethode, alles met de hand) ────────
//
// TRAPTREDE-LIGGER: vrij opgelegd over L, linkerhelft I₁, rechterhelft I₂,
// zelfde E. Statisch bepaald, dus de momentenlijn hangt NIET van I af:
//
//     UDL q (omlaag):   M(x) = q·x·(L − x)/2        M(L/2) = qL²/8
//     puntlast P op ½L: M(x) = P·x/2   (x ≤ L/2)    M(L/2) = PL/4
//
// De zakking in het midden volgt uit δ = ∫ M·m/(E·I) dx met m(x) het moment
// uit een eenheidslast op ½L: m = x/2 voor x ≤ L/2, m = (L−x)/2 daarna.
// M en m zijn in beide belastinggevallen symmetrisch om ½L, dus beide helften
// leveren dezelfde integraal J en geldt δ = J/(E·I₁) + J/(E·I₂).
//
//   UDL:      J = ∫₀^{L/2} [q·x·(L−x)/2]·[x/2] dx
//               = (q/4)·[L·x³/3 − x⁴/4]₀^{L/2}
//               = (q/4)·(L⁴/24 − L⁴/64) = (q/4)·(5L⁴/192) = 5qL⁴/768
//     ⇒  δ = (5qL⁴/768)·(1/(E·I₁) + 1/(E·I₂))
//        controle I₁ = I₂ = I:  2·5qL⁴/(768EI) = 5qL⁴/(384EI)   ✓ klassiek
//
//   puntlast: J = ∫₀^{L/2} (P·x/2)·(x/2) dx = (P/4)·(L³/24) = PL³/96
//     ⇒  δ = (PL³/96)·(1/(E·I₁) + 1/(E·I₂))
//        controle I₁ = I₂ = I:  2PL³/(96EI) = PL³/(48EI)        ✓ klassiek
//
// DEELLAST w over [L/4, 3L/4], vrij opgelegd, symmetrisch:
//     R = w·L/4;  M(L/2) = R·L/2 − ∫_{L/4}^{L/2} w·(L/2 − ξ) dξ
//                        = wL²/8 − wL²/32 = 3wL²/32
//
// PUNTLAST P op x = a (b = L − a), vrij opgelegd:
//     R_A = P·b/L;  M(a) = P·a·b/L;  V springt van +R_A naar +R_A − P
//
// EXACTHEID VAN HET REKENMODEL. Voor een Euler-Bernoulli-staaf met constante
// EI per element en consistente knooplasten is de eindige-elementenoplossing
// in de KNOPEN exact: de homogene oplossing is kubisch en ligt dus in de
// Hermite-ruimte. Alle bovenstaande waarden horen daarom tot op afrondnauw-
// keurigheid te kloppen, niet "binnen enkele procenten". De toetsen hieronder
// hanteren 1e-9 relatief en drukken de GEMETEN afwijking altijd af.

const { solve, solveAllCases, solveAllCasesNonlinear } =
  await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Relatieve toets; drukt de gemeten afwijking altijd af. */
function check(naam, gemeten, verwacht, tolRel = 1e-9) {
  const schaal = Math.abs(verwacht) > 1e-12 ? Math.abs(verwacht) : 1;
  const rel = Math.abs(gemeten - verwacht) / schaal;
  if (rel <= tolRel) {
    passed++;
    log(`  ✓ ${naam}: ${gemeten.toPrecision(10)} (afw ${rel.toExponential(2)})`);
  } else {
    failed++;
    log(`  ✗ ${naam}: ${gemeten.toPrecision(10)} vs ${verwacht.toPrecision(10)} (afw ${rel.toExponential(2)} > ${tolRel.toExponential(0)})`);
  }
  return rel;
}

function checkWaar(naam, voorwaarde, toelichting = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${toelichting ? ` — ${toelichting}` : ""}`); }
  else { failed++; log(`  ✗ ${naam}${toelichting ? ` — ${toelichting}` : ""}`); }
}

// ── Gereedschap ────────────────────────────────────────────────────────────
const E0 = 210000, A0 = 3877, I0 = 1.673e7;   // HEA 160 / S235

/** Gelijke segmenten met dezelfde I — de invariantindeling. */
const gelijkeSegmenten = (n, I) =>
  Array.from({ length: n }, (_, k) => ({ tStart: k / n, tEnd: (k + 1) / n, I }));

/** Lengte van elk rekenelement uit de stationsreeks (21 stations per element). */
function elementLengtes(el) {
  const uit = [];
  for (let i = 0; i + 20 < el.stations_mm.length; i += 21) {
    uit.push(el.stations_mm[i + 20] - el.stations_mm[i]);
  }
  return uit;
}

/** Index van het (eerste) station op positie x. */
function bijX(el, x, tol = 1e-6) {
  for (let i = 0; i < el.stations_mm.length; i++) {
    if (Math.abs(el.stations_mm[i] - x) <= tol) return i;
  }
  return -1;
}

/** Waarde van een stationsreeks op positie x. */
const waardeBijX = (el, reeks, x) => el[reeks][bijX(el, x)];

// ═══════════════════════════════════════════════════════════════════════════
log("\n[1] Traptrede-ligger onder UDL — één staaf, linkerhelft I₁, rechterhelft I₂");
// ═══════════════════════════════════════════════════════════════════════════
const L = 6000, q = 10;                       // mm, N/mm (omlaag)
const I1 = I0, I2 = 3 * I0;
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{
      id: 1, from: 1, to: 2, E: E0, A: A0, I: I1,
      segmenten: [{ tStart: 0, tEnd: 0.5, I: I1 }, { tStart: 0.5, tEnd: 1, I: I2 }],
    }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -q }],
  });
  const el = r.elements.get(1);

  // Zakking in het midden — δ = (5qL⁴/768)·(1/EI₁ + 1/EI₂), omlaag = negatief
  const deltaHand = -(5 * q * L ** 4 / 768) * (1 / (E0 * I1) + 1 / (E0 * I2));
  const afwUDL = check("δ(½L) = (5qL⁴/768)·(1/EI₁+1/EI₂)", waardeBijX(el, "deflection", L / 2), deltaHand);
  log(`      handberekening: ${deltaHand.toFixed(6)} mm`);

  // Momentenlijn — statisch bepaald, dus I-onafhankelijk
  for (const x of [L / 4, L / 2, 3 * L / 4]) {
    check(`M(${x}) = q·x·(L−x)/2`, waardeBijX(el, "bendingMoment", x), q * x * (L - x) / 2);
  }
  check("reactie A = qL/2", r.reactions.get(1).fz, q * L / 2);
  check("reactie B = qL/2", r.reactions.get(2).fz, q * L / 2);

  // Controle op de formule zelf: gelijke I geeft de klassieke 5qL⁴/384EI
  const rGelijk = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{
      id: 1, from: 1, to: 2, E: E0, A: A0, I: I1,
      segmenten: [{ tStart: 0, tEnd: 0.5, I: I1 }, { tStart: 0.5, tEnd: 1, I: I1 }],
    }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -q }],
  });
  check("limiet I₁=I₂: δ = 5qL⁴/384EI",
    waardeBijX(rGelijk.elements.get(1), "deflection", L / 2),
    -(5 * q * L ** 4) / (384 * E0 * I1));

  log(`      → gemeten afwijking traptrede-ligger onder UDL: ${afwUDL.toExponential(2)} relatief`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] Traptrede-ligger onder een puntlast op het midden");
// ═══════════════════════════════════════════════════════════════════════════
const P = 50000;                              // N (omlaag)
{
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{
      id: 1, from: 1, to: 2, E: E0, A: A0, I: I1,
      segmenten: [{ tStart: 0, tEnd: 0.5, I: I1 }, { tStart: 0.5, tEnd: 1, I: I2 }],
    }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [],
    beamPointLoads: [{ beamId: 1, posFrac: 0.5, fz: -P }],
  });
  const el = r.elements.get(1);
  const deltaHand = -(P * L ** 3 / 96) * (1 / (E0 * I1) + 1 / (E0 * I2));
  const afwP = check("δ(½L) = (PL³/96)·(1/EI₁+1/EI₂)", waardeBijX(el, "deflection", L / 2), deltaHand);
  log(`      handberekening: ${deltaHand.toFixed(6)} mm`);
  check("M(½L) = PL/4", waardeBijX(el, "bendingMoment", L / 2), P * L / 4);
  check("M(¼L) = P·x/2", waardeBijX(el, "bendingMoment", L / 4), P * (L / 4) / 2);
  check("reactie A = P/2", r.reactions.get(1).fz, P / 2);
  log(`      → gemeten afwijking traptrede-ligger onder puntlast: ${afwP.toExponential(2)} relatief`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] Dezelfde traptrede-ligger, maar in 10 segmenten beschreven");
// ═══════════════════════════════════════════════════════════════════════════
// Fysiek dezelfde staaf (5×I₁ dan 5×I₂), fijnere beschrijving. De uitkomst
// moet gelijk zijn aan die van de tweesegmentenversie én aan de handberekening.
{
  const tien = Array.from({ length: 10 }, (_, k) => ({
    tStart: k / 10, tEnd: (k + 1) / 10, I: k < 5 ? I1 : I2,
  }));
  const r = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I1, segmenten: tien }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -q }],
  });
  const el = r.elements.get(1);
  checkWaar("10 rekenelementen", elementLengtes(el).length === 10,
    `gevonden ${elementLengtes(el).length}`);
  const deltaHand = -(5 * q * L ** 4 / 768) * (1 / (E0 * I1) + 1 / (E0 * I2));
  check("δ(½L) gelijk aan de handberekening", waardeBijX(el, "deflection", L / 2), deltaHand);
  check("M(½L) = qL²/8", waardeBijX(el, "bendingMoment", L / 2), q * L * L / 8);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[4] INVARIANT — N gelijke segmenten geeft hetzelfde als géén segmenten");
// ═══════════════════════════════════════════════════════════════════════════
// Dit is de invariant die de hele constructie draagt: als het opknippen zelf
// al iets aan de uitkomst verandert, is elk segmentresultaat verdacht.
// Model: portaal, statisch onbepaald, met UDL, horizontale knooplast, een
// scharnier aan één staafeinde en een verdeelde last — dus alles wat de
// splitslus moet overleven, tegelijk.
//
// WAAROM ER OP GEDEELDE STATIONS WORDT VERGELEKEN. Vroeger was het raster van
// het gesegmenteerde model altijd een VERFIJNING van dat van het
// ongesegmenteerde: één staaf met 21 stations tegenover n gelijke stukken met
// elk 21 stations, en L/20 is altijd een veelvoud van L/(20n). Sinds de solver
// óók op een DEELLASTGRENS een snede zet, gaat dat niet meer op. Beide
// modellen krijgen wel dezelfde sneden (0,2 en 0,9 op staaf 1), maar daardoor
// bestaat het ONGESEGMENTEERDE model uit stukken van 0,2L, 0,7L en 0,1L met
// elk hun eigen stationsafstand, terwijl het gesegmenteerde model diezelfde
// stukken nóg eens op de segmentgrenzen knipt. De twee rasters overlappen dan
// gedeeltelijk in plaats van volledig.
// Er wordt daarom vergeleken op de stations die BEIDE modellen hebben, en het
// aantal wordt geteld en getoetst: 30 van de 63 in het ongunstigste geval
// (7 segmenten, staaf 1 met de deellast) en 21 van de 21 op de staven zonder
// deellast — nog altijd meer meetpunten per staaf dan het oude raster er in
// totaal had. De knoopverplaatsingen, de reacties en de eindwaarden N/V/M
// worden onverkort vergeleken; dáár zit de eigenlijke invariant.
{
  const bouw = (nSeg) => ({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3500 },
      { id: 3, x: 6000, z: 3500 }, { id: 4, x: 6000, z: 0 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E: E0, A: A0, I: I0, ...(nSeg ? { segmenten: gelijkeSegmenten(nSeg, I0) } : {}) },
      { id: 2, from: 2, to: 3, E: E0, A: A0, I: I0, ...(nSeg ? { segmenten: gelijkeSegmenten(nSeg, I0) } : {}) },
      { id: 3, from: 3, to: 4, E: E0, A: A0, I: I0, startConnection: "hinge", ...(nSeg ? { segmenten: gelijkeSegmenten(nSeg, I0) } : {}) },
    ],
    // Node 4 INGEKLEMD (niet scharnierend): anders zou staaf 3 — scharnier
    // bovenin, scharnier onderin — overal M ≡ 0 hebben en zou de vergelijking
    // op die staaf afrondruis tegen nul afzetten in plaats van tegen een echte
    // momentenlijn.
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "fixed" }],
    loads: [
      { beamId: 2, q: -12, caseId: 1 },
      { beamId: 1, q: 3, qDir: "x", startFrac: 0.2, endFrac: 0.9, caseId: 1 },
    ],
    pointLoads: [{ nodeId: 2, fx: 15000, caseId: 1 }],
    cases: [{ id: 1, name: "LC1" }],
  });

  const ref = solveAllCases(bouw(0)).perCase.get(1);

  // MODELBREDE schalen: een grootheid die in dit model nul is (bijvoorbeeld de
  // momentenlijn van een dubbelscharnierende staaf) mag niet tegen zijn eigen
  // nul worden afgezet — dan wordt afrondruis een "afwijking van 1e-5".
  const alleEls = [...ref.elements.values()];
  const grootste = (kies) => Math.max(...alleEls.flatMap((e) => kies(e).map(Math.abs)));
  const schaalM = grootste((e) => e.bendingMoment);
  const schaalV = grootste((e) => e.shearForce);
  const schaalW = grootste((e) => e.deflection);
  const schaalN = Math.max(...alleEls.map((e) => Math.abs(e.N)));
  const schaalU = ref.maxDisplacement;
  const schaalRy = Math.max(...[...ref.displacements.values()].map((d) => Math.abs(d.ry)));
  const schaalR = Math.max(...[...ref.reactions.values()].flatMap((R) => [Math.abs(R.fx), Math.abs(R.fz)]));
  const schaalRm = Math.max(...[...ref.reactions.values()].map((R) => Math.abs(R.my)));

  for (const nSeg of [5, 7, 20]) {
    const seg = solveAllCases(bouw(nSeg)).perCase.get(1);
    let ergste = 0, ergsteNaam = "";
    const meet = (naam, a, b, schaal) => {
      const rel = Math.abs(a - b) / (Math.abs(schaal) > 1e-12 ? Math.abs(schaal) : 1);
      if (rel > ergste) { ergste = rel; ergsteNaam = naam; }
    };
    // Knoopverplaatsingen en reacties
    for (const [id, d] of ref.displacements) {
      const s = seg.displacements.get(id);
      meet(`ux[${id}]`, s.ux, d.ux, schaalU);
      meet(`uz[${id}]`, s.uz, d.uz, schaalU);
      meet(`ry[${id}]`, s.ry, d.ry, schaalRy);
    }
    for (const [id, R] of ref.reactions) {
      const s = seg.reactions.get(id);
      meet(`Rfx[${id}]`, s.fx, R.fx, schaalR);
      meet(`Rfz[${id}]`, s.fz, R.fz, schaalR);
      meet(`Rmy[${id}]`, s.my, R.my, schaalRm);
    }
    // Staafkrachten: eindwaarden én elk gedeeld station
    for (const [id, e] of ref.elements) {
      const s = seg.elements.get(id);
      meet(`N[${id}]`, s.N, e.N, schaalN);
      meet(`V[${id}]`, s.V, e.V, schaalV);
      meet(`Mstart[${id}]`, s.M_start, e.M_start, schaalM);
      meet(`Mend[${id}]`, s.M_end, e.M_end, schaalM);
      meet(`L[${id}]`, s.L_mm, e.L_mm, e.L_mm);
      const mSchaal = schaalM, vSchaal = schaalV, wSchaal = schaalW;
      let gedeeld = 0;
      for (let i = 0; i < e.stations_mm.length; i++) {
        const j = bijX(s, e.stations_mm[i], 1e-6);
        if (j < 0) continue;   // station bestaat alleen links — zie de kop
        gedeeld++;
        meet(`M[${id}]@${e.stations_mm[i]}`, s.bendingMoment[j], e.bendingMoment[i], mSchaal);
        meet(`V[${id}]@${e.stations_mm[i]}`, s.shearForce[j], e.shearForce[i], vSchaal);
        meet(`w[${id}]@${e.stations_mm[i]}`, s.deflection[j], e.deflection[i], wSchaal);
      }
      checkWaar(`${nSeg} segm., staaf ${id}: genoeg gedeelde stations om op te vergelijken`,
        gedeeld >= 21, `${gedeeld} van de ${e.stations_mm.length}`);
    }
    checkWaar(`${nSeg} gelijke segmenten ≡ ongesegmenteerd`, ergste <= 1e-9,
      `grootste afwijking ${ergste.toExponential(2)} (${ergsteNaam})`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[5] Samenvoegregel — een puntlast vlak naast een segmentgrens");
// ═══════════════════════════════════════════════════════════════════════════
// 15 segmenten van 400 mm; segmentgrenzen dus op 400, 800, … 5600 mm.
// Elk segment een eigen, herkenbare I zodat de toewijzing controleerbaar is.
const MIN_SEG_MM = 25;                        // zoals in engine.ts
{
  const vijftien = Array.from({ length: 15 }, (_, k) => ({
    tStart: k / 15, tEnd: (k + 1) / 15, I: I0 * (1 + k / 100),
  }));
  const bouw = (xLast) => solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0, segmenten: vijftien }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -q }],
    beamPointLoads: [{ beamId: 1, posFrac: xLast / L, fz: -P }],
  });

  for (const [xLast, verwachtMin, toelichting] of [
    [2402, 398, "2 mm naast de grens op 2400 → grens vervalt"],
    [2410, 390, "10 mm naast de grens → grens vervalt"],
    [2400, 400, "exact óp de grens → grens valt samen"],
    [2440, 40, "40 mm naast de grens → grens blijft (boven de drempel)"],
  ]) {
    const el = bouw(xLast).elements.get(1);
    const lengtes = elementLengtes(el);
    const kortste = Math.min(...lengtes);
    checkWaar(`puntlast op ${xLast} mm: kortste element ${kortste.toFixed(3)} mm`,
      Math.abs(kortste - verwachtMin) < 1e-6, toelichting);
    checkWaar(`  geen flinter (≥ ${MIN_SEG_MM} mm)`, kortste >= MIN_SEG_MM - 1e-9,
      `kortste = ${kortste.toFixed(3)} mm`);
  }

  // Zonder samenvoegregel zou er een element van 2 mm ontstaan; controleer
  // meteen dat de I-toewijzing na het samenvoegen nog uit het MIDDEN volgt.
  const el = bouw(2402).elements.get(1);
  checkWaar("15 rekenelementen (14 grenzen: 13 segment + 1 puntlast)",
    el.segmenten.length === 15, `gevonden ${el.segmenten.length}`);
  const s5 = el.segmenten.find((s) => Math.abs(s.xStart - 2000) < 1e-6);
  const s6 = el.segmenten.find((s) => Math.abs(s.xStart - 2402) < 1e-6);
  checkWaar("stuk [2000, 2402] krijgt de I van segment 6 (index 5)",
    !!s5 && s5.segmentIndex === 5 && Math.abs(s5.I - I0 * 1.05) < 1e-6,
    s5 ? `index ${s5.segmentIndex}, I = ${s5.I.toExponential(6)}` : "niet gevonden");
  checkWaar("stuk [2402, 2800] krijgt de I van segment 7 (index 6)",
    !!s6 && s6.segmentIndex === 6 && Math.abs(s6.I - I0 * 1.06) < 1e-6,
    s6 ? `index ${s6.segmentIndex}, I = ${s6.I.toExponential(6)}` : "niet gevonden");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[6] Lasten en scharnieren komen na het opknippen op het juiste segment");
// ═══════════════════════════════════════════════════════════════════════════
{
  // 6a — DEELLAST over [¼L, ¾L] op een staaf met 4 segmenten
  log("  6a  deellast w over [¼L, ¾L], 4 segmenten");
  const w = 10;
  const bouwDeel = (metSeg) => solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{
      id: 1, from: 1, to: 2, E: E0, A: A0, I: I0,
      ...(metSeg ? { segmenten: gelijkeSegmenten(4, I0) } : {}),
    }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -w, startFrac: 0.25, endFrac: 0.75 }],
  });
  {
    const r = bouwDeel(true);
    const el = r.elements.get(1);
    check("R_A = wL/4", r.reactions.get(1).fz, w * L / 4);
    check("R_B = wL/4", r.reactions.get(2).fz, w * L / 4);
    check("M(½L) = 3wL²/32", waardeBijX(el, "bendingMoment", L / 2), 3 * w * L * L / 32);
    check("M(¼L) = R_A·L/4 (nog onbelast stuk)", waardeBijX(el, "bendingMoment", L / 4), (w * L / 4) * (L / 4));
    // en identiek aan dezelfde staaf zonder segmenten
    const ref = bouwDeel(false).elements.get(1);
    const mSchaal = Math.max(...ref.bendingMoment.map(Math.abs));
    let ergste = 0;
    for (let i = 0; i < ref.stations_mm.length; i++) {
      const j = bijX(el, ref.stations_mm[i]);
      ergste = Math.max(ergste, Math.abs(el.bendingMoment[j] - ref.bendingMoment[i]) / mSchaal);
    }
    checkWaar("deellast: gesegmenteerd ≡ ongesegmenteerd", ergste <= 1e-9,
      `grootste afwijking ${ergste.toExponential(2)}`);
  }

  // 6b — PUNTLAST exact OP een segmentgrens (t = ½, 4 segmenten)
  log("  6b  puntlast exact op een segmentgrens");
  {
    const r = solve({
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
      beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0, segmenten: gelijkeSegmenten(4, I0) }],
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
      loads: [],
      beamPointLoads: [{ beamId: 1, posFrac: 0.5, fz: -P }],
    });
    const el = r.elements.get(1);
    checkWaar("4 rekenelementen (grens en last vallen samen)",
      elementLengtes(el).length === 4, `gevonden ${elementLengtes(el).length}`);
    check("M(½L) = PL/4", waardeBijX(el, "bendingMoment", L / 2), P * L / 4);
    const i = bijX(el, L / 2);
    check("V links van de last = +P/2", el.shearForce[i], P / 2);
    check("V rechts van de last = −P/2", el.shearForce[i + 1], -P / 2);
  }

  // 6c — PUNTLAST ERTUSSENIN (t = 0,3; segmentgrenzen op 0,25/0,5/0,75)
  log("  6c  puntlast tussen twee segmentgrenzen in");
  {
    const a = 0.3 * L, b = L - a;
    const r = solve({
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
      beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0, segmenten: gelijkeSegmenten(4, I0) }],
      supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
      loads: [],
      beamPointLoads: [{ beamId: 1, posFrac: 0.3, fz: -P }],
    });
    const el = r.elements.get(1);
    checkWaar("5 rekenelementen (3 segmentgrenzen + 1 lastpositie)",
      elementLengtes(el).length === 5, `gevonden ${elementLengtes(el).length}`);
    check("R_A = P·b/L", r.reactions.get(1).fz, P * b / L);
    check("M(a) = P·a·b/L", waardeBijX(el, "bendingMoment", a), P * a * b / L);
    const i = bijX(el, a);
    check("V links van de last = +P·b/L", el.shearForce[i], P * b / L);
    check("V rechts van de last = −P·a/L", el.shearForce[i + 1], -P * a / L);
    // Beide stukken links en rechts van de lastpositie horen bij hetzelfde
    // invoersegment (index 1: [0,25 · L, 0,50 · L]).
    const links = el.segmenten.find((s) => Math.abs(s.xStart - 1500) < 1e-6);
    const rechts = el.segmenten.find((s) => Math.abs(s.xStart - a) < 1e-6);
    checkWaar("beide stukken rond de last horen bij segment 2 (index 1)",
      links?.segmentIndex === 1 && rechts?.segmentIndex === 1,
      `links ${links?.segmentIndex}, rechts ${rechts?.segmentIndex}`);
  }

  // 6d — SCHARNIER aan één uiteinde van een gesegmenteerde staaf
  log("  6d  scharnier aan één uiteinde");
  {
    const r = solve({
      nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
      beams: [{
        id: 1, from: 1, to: 2, E: E0, A: A0, I: I0,
        startConnection: "hinge", segmenten: gelijkeSegmenten(5, I0),
      }],
      // Inklemming + scharnier aan de staafzijde = vrij opgelegd gedrag.
      supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "zRoller" }],
      loads: [{ beamId: 1, q: -q }],
    });
    const el = r.elements.get(1);
    check("M aan het scharnier = 0", el.M_start, 0, 1e-9);
    check("R_A = qL/2 (scharnier maakt het vrij opgelegd)", r.reactions.get(1).fz, q * L / 2);
    check("M(½L) = qL²/8", waardeBijX(el, "bendingMoment", L / 2), q * L * L / 8);
    // Geen scharnieren op de tussenknopen: M is daar continu én niet nul.
    let continuOk = true, allemaalNietNul = true;
    for (let k = 1; k < 5; k++) {
      const x = k * L / 5, i = bijX(el, x);
      const links = el.bendingMoment[i], rechts = el.bendingMoment[i + 1];
      if (Math.abs(links - rechts) > 1e-6 * Math.abs(q * L * L / 8)) continuOk = false;
      if (Math.abs(links) < 1) allemaalNietNul = false;
    }
    checkWaar("M continu op de segmentgrenzen", continuOk);
    checkWaar("geen extra scharnieren op de segmentgrenzen (M ≠ 0)", allemaalNietNul);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[7] Het uitvoerveld");
// ═══════════════════════════════════════════════════════════════════════════
{
  // 7a — zonder segmenten blijft het veld weg
  const zonder = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -q }],
  });
  checkWaar("zonder segmenten: ElementForces.segmenten ontbreekt",
    zonder.elements.get(1).segmenten === undefined);

  // 7b — met segmenten: sluitend, op volgorde, juiste I
  const drie = [
    { tStart: 0, tEnd: 0.3, I: I0 },
    { tStart: 0.3, tEnd: 0.7, I: 2 * I0 },
    { tStart: 0.7, tEnd: 1, I: 3 * I0 },
  ];
  const met = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0, segmenten: drie }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -q }],
  });
  const el = met.elements.get(1);
  const segs = el.segmenten;
  checkWaar("3 stukken", segs.length === 3, `gevonden ${segs.length}`);
  check("xStart[0] = 0", segs[0].xStart, 0, 1e-12);
  check("xEnd[laatste] = L_mm", segs[segs.length - 1].xEnd, el.L_mm, 1e-12);
  let aansluitend = true, ISomOk = true;
  for (let i = 0; i < segs.length; i++) {
    if (i > 0 && Math.abs(segs[i].xStart - segs[i - 1].xEnd) > 1e-9) aansluitend = false;
    if (segs[i].segmentIndex !== i || Math.abs(segs[i].I - drie[i].I) > 1e-6) ISomOk = false;
  }
  checkWaar("stukken sluiten aaneen", aansluitend);
  checkWaar("I en segmentIndex per stuk kloppen", ISomOk);
  check("Σ stuklengtes = L", segs.reduce((s, x) => s + (x.xEnd - x.xStart), 0), L, 1e-12);
  // Het middenstuk bevat ½L, dus daar hoort M_max = qL²/8 te staan
  const midden = segs[1];
  check("M_max van het middenstuk = qL²/8", midden.M_max, q * L * L / 8, 1e-9);
  check("M_start/M_end van het middenstuk = q·x·(L−x)/2 op 0,3L",
    midden.M_start, q * (0.3 * L) * (L - 0.3 * L) / 2);

  // 7c — tekenconventie N: gesegmenteerde kolom onder druk
  const kolom = solve({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0, segmenten: gelijkeSegmenten(4, I0) }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: -100000, fx: 2000 }],
  });
  const k = kolom.elements.get(1);
  check("N staaf = −100 kN (druk, trek positief)", k.N, -100000);
  check("N_start eerste stuk = staaf-N", k.segmenten[0].N_start, k.N, 1e-9);
  checkWaar("alle stukken melden druk", k.segmenten.every((s) => s.N_start < 0 && s.N_end < 0));
  const grootste = k.segmenten.reduce((a, s) => Math.abs(s.M_max) > Math.abs(a.M_max) ? s : a);
  check("grootste M_max staat bij de inklemming (M = H·h)", grootste.M_max, -2000 * 3000, 1e-6);
  check("N bij dat M_max is dezelfde drukkracht", grootste.N_bij_M_max, -100000, 1e-9);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[8] Validatie van de segmentinvoer — liever een nette fout dan een stille I");
// ═══════════════════════════════════════════════════════════════════════════
{
  const basis = (segmenten) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0, segmenten }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ beamId: 1, q: -q }],
  });
  const weigert = (naam, segmenten, fragment) => {
    try {
      solve(basis(segmenten));
      failed++; log(`  ✗ ${naam}: geen fout gemeld`);
    } catch (e) {
      const ok = e instanceof Error && e.message.includes(fragment);
      if (ok) { passed++; log(`  ✓ ${naam}: "${e.message.slice(0, 72)}…"`); }
      else { failed++; log(`  ✗ ${naam}: onverwachte melding "${e.message}"`); }
    }
  };
  weigert("lege lijst", [], "leeg");
  weigert("gat in de indeling",
    [{ tStart: 0, tEnd: 0.4, I: I0 }, { tStart: 0.6, tEnd: 1, I: I0 }], "aaneensluiten");
  weigert("overlap",
    [{ tStart: 0, tEnd: 0.6, I: I0 }, { tStart: 0.4, tEnd: 1, I: I0 }], "aaneensluiten");
  weigert("begint niet bij 0",
    [{ tStart: 0.1, tEnd: 1, I: I0 }], "dekken");
  weigert("eindigt niet bij 1",
    [{ tStart: 0, tEnd: 0.9, I: I0 }], "dekken");
  weigert("tEnd ≤ tStart",
    [{ tStart: 0, tEnd: 0.5, I: I0 }, { tStart: 0.5, tEnd: 0.5, I: I0 }], "groter zijn dan");
  weigert("I ≤ 0",
    [{ tStart: 0, tEnd: 0.5, I: 0 }, { tStart: 0.5, tEnd: 1, I: I0 }], "groter dan nul");
  weigert("segment korter dan de knooptolerantie",
    [{ tStart: 0, tEnd: 0.5, I: I0 },
     { tStart: 0.5, tEnd: 0.5 + 0.5 / 6000, I: I0 },   // 0,5 mm
     { tStart: 0.5 + 0.5 / 6000, tEnd: 1, I: I0 }], "knooptolerantie");

  // Een geldige indeling van één segment over de volle lengte moet gewoon werken
  const enkel = solve(basis([{ tStart: 0, tEnd: 1, I: 2 * I0 }]));
  check("één segment over de volle lengte: δ = 5qL⁴/384E(2I)",
    waardeBijX(enkel.elements.get(1), "deflection", L / 2),
    -(5 * q * L ** 4) / (384 * E0 * 2 * I0));
  checkWaar("één segment levert één stuk", enkel.elements.get(1).segmenten.length === 1);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[9] Segmenten door het 2e-orde-pad (het pad waarop de iteratielus gaat draaien)");
// ═══════════════════════════════════════════════════════════════════════════
// solveCombinationSecondOrder bouwt zijn eigen mesh; deze toets bewaakt dat de
// segmenten daar meekomen én dat het opknippen de 2e-orde-uitkomst juist
// SCHERPER maakt. Referentie: de exacte secans-vergrotingsfactor van een
// pendelkolom met dwarslast H op ½L en druk P:
//
//     w₂/w₁ = [ (tan u − u)/(2·P·k) ] / [ L³/(48·E·I) ],  u = k·L/2, k = √(P/EI)
//
// Het engine-commentaar zegt zelf dat het P·w(x)-aandeel BINNEN een element
// ontbreekt en dat onderverdelen de voorgeschreven reparatie is; met segmenten
// hoort die reparatie dus vanzelf te komen.
{
  const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
  const Lk = 6000, EI = E0 * I0;
  const P_E = Math.PI ** 2 * EI / Lk ** 2;
  const Pdruk = 0.5 * P_E, H = 10000;
  const k = Math.sqrt(Pdruk / EI), u = k * Lk / 2;
  const ampExact = ((Math.tan(u) - u) / (2 * Pdruk * k)) / (Lk ** 3 / (48 * EI));

  const model = (nSeg) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: Lk }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0, segmenten: gelijkeSegmenten(nSeg, I0) }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "xRoller" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: -Pdruk, caseId: 1 }],
    beamPointLoads: [{ beamId: 1, posFrac: 0.5, fx: H, caseId: 1 }],
    cases: [{ id: 1, name: "LC1" }],
  });
  const comb = { id: 1, name: "COMBO", type: "uls", formula: "1·LC1", factors: new Map([[1, 1]]) };
  const maxW = (r) => Math.max(...r.elements.get(1).deflection.map(Math.abs));

  log(`      exacte vergrotingsfactor = ${ampExact.toFixed(5)}`);
  const afwijkingen = [];
  for (const nSeg of [2, 4, 20]) {
    const inv = model(nSeg);
    const w1 = maxW(combineResults(comb, solveAllCases(inv).perCase));
    const nl = solveAllCasesNonlinear(inv);
    const r2 = combineResults(comb, nl.perCase);
    const ratio = maxW(r2) / w1;
    const afw = Math.abs(ratio - ampExact) / ampExact;
    afwijkingen.push(afw);
    log(`      ${String(nSeg).padStart(2)} segmenten: ratio ${ratio.toFixed(5)} (afw ${(afw * 100).toFixed(3)} %)`);
    checkWaar(`${nSeg} segmenten: segmentveld komt door het 2e-orde-pad`,
      r2.elements.get(1).segmenten?.length === nSeg,
      `stukken: ${r2.elements.get(1).segmenten?.length}`);
  }
  checkWaar("fijner opknippen brengt de 2e orde dichter bij de exacte factor",
    afwijkingen[2] < afwijkingen[1] && afwijkingen[1] < afwijkingen[0],
    afwijkingen.map((a) => `${(a * 100).toFixed(3)} %`).join(" → "));
  checkWaar("20 segmenten: binnen 0,5 % van de exacte factor", afwijkingen[2] < 0.005,
    `${(afwijkingen[2] * 100).toFixed(3)} %`);
}

log(`\n═══ TOTAAL: ${passed} geslaagd, ${failed} gefaald ═══`);
process.exit(failed > 0 ? 1 : 0);
