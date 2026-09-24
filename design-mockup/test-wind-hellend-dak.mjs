// Windgenerator, hellend dak van een gebouw (issue #49): c_pe,10 per zone
// automatisch uit NEN-EN 1991-1-4+NB tabel NB.10/NB.11 – 7.4a/7.4b (zadeldak)
// en NB.8/NB.9 – 7.3a/7.3b (lessenaarsdak), met de zones langs het dakvlak
// als deellasten.
//
// REFERENTIEMODELLEN (mm)
//   Zadeldak α:  1 (0,0)  2 (12000,0)  3 (0,5000)  4 (6000, 5000+6000·tan α)  5 (12000,5000)
//                staaf 1 = 1→3 linkergevel, 2 = 2→5 rechtergevel,
//                staaf 3 = 3→4 linkerdakvlak, 4 = 4→5 rechterdakvlak.
//   Lessenaarsdak 15°: 1 (0,0) 2 (12000,0) 3 (0,5000) 4 (12000, 5000+12000·tan 15°)
//                staaf 3 = 3→4 loopt op naar rechts (hoge dakrand rechts).
//
// Instellingen: q_p = 1,000 kN/m² (handmatig), c_pi = 0 (handmatig, zodat
// w = q_p·c_pe), h.o.h. 5,00 m, gebouwlengte b = 10,00 m, tussenspant op
// 5,00 m van de kopgevel. Belastingbreedte B = 5,00 m (tussenspant) of 2,50 m
// (kopgevelspant).
//
// TEKEN. Beide dakstaven hebben hun lokale +z naar buiten-boven (de
// buitennormaal). q_lokaal = −w·B·(n·t) = −c_pe·B. Zuiging (c_pe < 0) geeft
// dus een POSITIEVE lokale q.
//
// HANDBEREKENING — ZONES
//   h = 5 + 6·tan α ;  θ = 0°:  e = min(b; 2h) = min(10; ≥ 13,2) = 10,00 m
//     loefvlak (staaf 3, x 0…6 m):  F/G 0–1 000 mm (e/10)  → fractie 0…1/6
//                                   H   1 000–6 000 mm     → fractie 1/6…1
//     lijvlak  (staaf 4, x 6…12 m): J   6 000–7 000 mm (e/10 voorbij de nok) → 0…1/6
//                                   I   7 000–12 000 mm    → 1/6…1
//     Tussenspant op 5 m > e/4 = 2,5 m ⇒ G; kopgevelspant ⇒ F.
//   θ = 90°:  e = min(d; 2h) = min(12; ≥ 13,2) = 12,00 m, e/10 = 1,2 m, e/2 = 6 m
//     tussenspant y = 5 m: 1,2 ≤ 5 < 6 ⇒ H over de hele breedte;
//     y = 7 m ≥ 6 ⇒ I; kopgevelspant y = 0 < 1,2 ⇒ F 0–3 000 mm (e/4),
//     G 3 000–9 000 mm, F 9 000–12 000 mm.
//
// HANDBEREKENING — c_pe,10 (tabel NB.10 – 7.4a, θ = 0°; tabel NB.11 – 7.4b, θ = 90°)
//   α = 15°: F −0,9/+0,2  G −0,8/+0,2  H −0,3/+0,2  I −0,4/+0,0  J −1,0/+0,0
//            θ=90°: F −1,3  G −1,3  H −0,6  I −0,5
//   α = 30°: F −0,5/+0,7  G −0,5/+0,7  H −0,2/+0,4  I −0,4/+0,0  J −0,5/+0,0
//            θ=90°: F −1,1  G −1,4  H −0,8  I −0,5
//   α = 20° (lineair, f = (20−15)/(30−15) = 1/3, per teken apart):
//            F −0,9+0,4/3 = −0,766667 / +0,2+0,5/3 = +0,366667
//            G −0,8+0,3/3 = −0,700000 / +0,366667
//            H −0,3+0,1/3 = −0,266667 / +0,2+0,2/3 = +0,266667
//            I −0,400000 / +0,000000   J −1,0+0,5/3 = −0,833333 / +0,000000
//            θ=90°: F −1,3+0,2/3 = −1,233333  G −1,3−0,1/3 = −1,333333
//                   H −0,6−0,2/3 = −0,666667  I −0,5
//
// GEVALLEN (opmerking 1 bij tabel 7.4a): loefvlak − of +, lijvlak − of + ⇒
// vier gevallen per windrichting en c_pi: loef-lij-, loef-lij+, loef+lij-,
// loef+lij+. Lessenaarsdak, wind op de lage rand (θ = 0°): dak- en dak+;
// op de hoge rand (θ = 180°) en haaks één geval.
//
// Draaien met: npx tsx test-wind-hellend-dak.mjs

const {
  genereerWindbelasting, genereerWindCombinaties, STANDAARD_WIND_INSTELLINGEN,
  handtekeningVanGeneratie, handtekeningVanModel, hellendDakUitgangspunten, windUitgangspunten,
} = await import("./src/lib/wind/windGenerator.ts");
const { hellendDakCpe, HELLEND_DAK_UITGANGSPUNT } = await import("./src/lib/wind/windEurocode.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(name, actual, expected, tol = 1e-9) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol + Math.abs(expected) * 1e-9;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(6)} ≈ ${expected}`); }
  else { failed++; log(`  ✗ ${name}: ${actual} vs ${expected}`); }
}
function checkExact(name, actual, expected) {
  const ok = actual === expected;
  const k = (v) => { const s = JSON.stringify(v); return s !== undefined && s.length > 140 ? s.slice(0, 137) + "…" : s; };
  if (ok) { passed++; log(`  ✓ ${name}: ${k(actual)}`); }
  else { failed++; log(`  ✗ ${name}: ${k(actual)} vs ${k(expected)}`); }
}
function checkTrue(name, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${name}${extra ? " — " + extra : ""}`); }
  else { failed++; log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

const rad = (a) => a * Math.PI / 180;
function zadel(alpha, extra = {}) {
  const zn = 5000 + 6000 * Math.tan(rad(alpha));
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }, { id: 3, x: 0, z: 5000 }, { id: 4, x: 6000, z: zn }, { id: 5, x: 12000, z: 5000 }],
    beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 5 }, { id: 3, from: 3, to: 4 }, { id: 4, from: 4, to: 5 }],
    loadCases: [{ id: 1, name: "Eigen gewicht", type: "dead" }],
    ...extra,
  };
}
const lessenaar15 = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }, { id: 3, x: 0, z: 5000 }, { id: 4, x: 12000, z: 5000 + 12000 * Math.tan(rad(15)) }],
  beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 }],
  loadCases: [{ id: 1, name: "Eigen gewicht", type: "dead" }],
};
const basis = {
  ...STANDAARD_WIND_INSTELLINGEN,
  stuwdrukBron: "handmatig", qpHandmatig_kNm2: 1.0,
  richtingLinks: true, richtingRechts: false, richtingHaaks: false,
  cpiKeuze: "handmatig", cpiHandmatig: 0,
  hohSpant_m: 5, positieSpant: "tussenspant", belastingbreedteOverride_m: null,
  gebouwlengte_m: 10, afstandTotKopgevel_m: 5,
  cpeDakLoef: null, cpeDakLij: null, cpeDakHaaks: null,
  combinatiesGenereren: false,
};

/** De (deel)lasten van één geval op één staaf, gesorteerd op startfractie. */
const lastenVan = (res, sleutel, beamId) => res.lasten
  .filter((l) => l.gevalSleutel === sleutel && l.beamId === beamId)
  .sort((a, b) => (a.startFrac ?? 0) - (b.startFrac ?? 0));
/** Samenvattingsregels (ook de netto-nul-regels, die geen last worden). */
const regelsVan = (res, sleutel, beamId) => res.samenvatting.perGeval.find((g) => g.sleutel === sleutel).regels
  .filter((r) => r.beamId === beamId).sort((a, b) => (a.startFrac ?? 0) - (b.startFrac ?? 0));

/**
 * Controle van één dakstaaf: per zone [naam, startfractie, eindfractie, c_pe],
 * de c_pe in de samenvatting en de lijnlast q = −c_pe·B.
 */
function dakstaaf(label, res, sleutel, beamId, B, verwacht) {
  const regels = regelsVan(res, sleutel, beamId);
  checkExact(`${label}: ${verwacht.length} zone(s) op staaf ${beamId}`, regels.length, verwacht.length);
  verwacht.forEach(([zone, van, tot, cpe], k) => {
    const r = regels[k];
    if (!r) { failed++; log(`  ✗ ${label}: zone ${zone} ontbreekt`); return; }
    checkExact(`${label}: staaf ${beamId} zone ${k + 1}`, r.zone.replace(/ \(.*\)$/, ""), zone);
    check(`${label}: ${zone} startfractie`, r.startFrac ?? 0, van);
    check(`${label}: ${zone} eindfractie`, r.endFrac ?? 1, tot);
    check(`${label}: ${zone} c_pe,10`, r.cpe, cpe, 1e-12);
    check(`${label}: ${zone} q = −c_pe·B`, r.q_kNm, -cpe * B, 1e-12);
  });
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Tabelopzoeking — celwaarden en interpolatie per teken");
{
  const z15 = hellendDakCpe("zadel", 0, 15);
  checkTrue("7.4a α = 15°: op de rij, geen interpolatie", z15.ok && z15.rijOnder === 15 && z15.rijBoven === 15);
  checkExact("7.4a α = 15°: F", JSON.stringify(z15.zones.F), JSON.stringify({ neg: -0.9, pos: 0.2 }));
  checkExact("7.4a α = 15°: J", JSON.stringify(z15.zones.J), JSON.stringify({ neg: -1.0, pos: 0.0 }));
  const z20 = hellendDakCpe("zadel", 0, 20);
  checkTrue("7.4a α = 20°: tussen de rijen 15° en 30°", z20.ok && z20.rijOnder === 15 && z20.rijBoven === 30);
  check("7.4a α = 20°: F negatief", z20.zones.F.neg, -0.9 + 0.4 / 3);
  check("7.4a α = 20°: F positief", z20.zones.F.pos, 0.2 + 0.5 / 3);
  check("7.4a α = 20°: G negatief", z20.zones.G.neg, -0.7);
  check("7.4a α = 20°: H positief", z20.zones.H.pos, 0.2 + 0.2 / 3);
  check("7.4a α = 20°: J negatief", z20.zones.J.neg, -1.0 + 0.5 / 3);
  const b20 = hellendDakCpe("zadel", 90, 20);
  check("7.4b α = 20°: F", b20.zones.F.neg, -1.3 + 0.2 / 3);
  check("7.4b α = 20°: G", b20.zones.G.neg, -1.3 - 0.1 / 3);
  checkTrue("7.4b heeft alleen negatieve waarden", Object.values(b20.zones).every((c) => c.pos === undefined));
  // Opmerking 2: niet tussen tekens interpoleren. Zone I heeft bij 5° alleen
  // −0,6 en bij 15° −0,4 / +0,0: tussen die rijen valt de positieve weg.
  const z10 = hellendDakCpe("zadel", 0, 10);
  check("7.4a α = 10°: I negatief (−0,6 → −0,4)", z10.zones.I.neg, -0.5);
  checkTrue("7.4a α = 10°: I positief vervalt", z10.zones.I.pos === undefined
    && z10.vervallen.some((v) => v.zone === "I" && v.teken === "pos"));
  // Tussen −5° en +5° niet interpoleren (platte daken §7.2.3); buiten de tabel weigeren.
  checkTrue("7.4a α = 3°: geweigerd, verwijst naar §7.2.3", !hellendDakCpe("zadel", 0, 3).ok && /7\.2\.3/.test(hellendDakCpe("zadel", 0, 3).reden));
  checkTrue("7.4a α = 80°: geweigerd", !hellendDakCpe("zadel", 0, 80).ok);
  checkTrue("7.4a α = −10° (goot): tussen −15° en −5°", hellendDakCpe("zadel", 0, -10).ok);
  // Lessenaarsdak.
  const l15 = hellendDakCpe("lessenaar", 0, 15);
  checkExact("7.3a θ = 0° α = 15°: G", JSON.stringify(l15.zones.G), JSON.stringify({ neg: -0.8, pos: 0.2 }));
  const l180 = hellendDakCpe("lessenaar", 180, 15);
  checkExact("7.3a θ = 180° α = 15°: F G H", [l180.zones.F.neg, l180.zones.G.neg, l180.zones.H.neg].join(" "), "-2.5 -1.3 -0.9");
  const l90 = hellendDakCpe("lessenaar", 90, 15);
  checkExact("7.3b α = 15°: F_hoog F_laag G H I", [l90.zones.Fhoog.neg, l90.zones.Flaag.neg, l90.zones.G.neg, l90.zones.H.neg, l90.zones.I.neg].join(" "), "-2.4 -1.6 -1.9 -0.8 -0.7");
  checkTrue("vindplaats noemt de NB-tabel", /NB\.10 – 7\.4a/.test(z15.bron) && /NB\.9 – 7\.3b/.test(l90.bron));
}

// ─────────────────────────────────────────────────────────────────────────
for (const [alpha, cpe] of [
  [15, { F: [-0.9, 0.2], G: [-0.8, 0.2], H: [-0.3, 0.2], I: [-0.4, 0.0], J: [-1.0, 0.0] }],
  [30, { F: [-0.5, 0.7], G: [-0.5, 0.7], H: [-0.2, 0.4], I: [-0.4, 0.0], J: [-0.5, 0.0] }],
  [20, { F: [-0.9 + 0.4 / 3, 0.2 + 0.5 / 3], G: [-0.7, 0.2 + 0.5 / 3], H: [-0.3 + 0.1 / 3, 0.2 + 0.2 / 3], I: [-0.4, 0.0], J: [-1.0 + 0.5 / 3, 0.0] }],
]) {
  log(`\n[2] Zadeldak α = ${alpha}°, θ = 0°, wind van links, tussenspant (zone G)`);
  const res = genereerWindbelasting(zadel(alpha), basis);
  checkTrue("generatie geslaagd", res.ok, res.meldingen.filter((m) => m.niveau === "fout").map((m) => m.tekst).join(" | "));
  checkExact("vier gevallen (opmerking 1)", res.gevallen.map((g) => g.sleutel).join(" "),
    "wind:links:cpi+0.00:loef-lij- wind:links:cpi+0.00:loef-lij+ wind:links:cpi+0.00:loef+lij- wind:links:cpi+0.00:loef+lij+");
  checkExact("naam van het tweede geval", res.gevallen[1].naam, "Wind van links (c_pi = 0,00), dak loef −, lij +");
  const f6 = 1 / 6;
  for (const [code, loef, lij] of [["loef-lij-", 0, 0], ["loef-lij+", 0, 1], ["loef+lij-", 1, 0], ["loef+lij+", 1, 1]]) {
    const s = `wind:links:cpi+0.00:${code}`;
    dakstaaf(`α=${alpha} ${code}`, res, s, 3, 5, [["G", 0, f6, cpe.G[loef]], ["H", f6, 1, cpe.H[loef]]]);
    dakstaaf(`α=${alpha} ${code}`, res, s, 4, 5, [["J", 0, f6, cpe.J[lij]], ["I", f6, 1, cpe.I[lij]]]);
  }
  // Een netto nul (I en J positief = +0,0 bij c_pi = 0) staat in de
  // samenvatting maar wordt geen last.
  checkExact("loef+lij+: op het lijvlak geen last (c_pe = +0,0)", lastenVan(res, "wind:links:cpi+0.00:loef+lij+", 4).length, 0);
  const l = lastenVan(res, "wind:links:cpi+0.00:loef-lij-", 3);
  checkTrue("omschrijving: tabel, θ, α, e en zonegrenzen in mm",
    l[0].omschrijving.startsWith(`§7.2.5 tabel 7.4a (θ = 0°, α = ${alpha},0°, `) && l[0].omschrijving.includes("e = 10000 mm: zone G 0–1000 mm vanaf de loefgevel")
    && l[1].omschrijving.includes("zone H 1000–6000 mm"), l[0].omschrijving);
  checkTrue(alpha === 20 ? "omschrijving noemt de interpolatie" : "omschrijving noemt de tabelrij",
    alpha === 20 ? l[0].omschrijving.includes("lineair tussen α = 15° en 30°") : l[0].omschrijving.includes(`rij α = ${alpha}°`));
  const lij = lastenVan(res, "wind:links:cpi+0.00:loef-lij-", 4);
  checkTrue("omschrijving lijvlak: J 6000–7000 mm, I 7000–12000 mm",
    lij[0].omschrijving.includes("zone J 6000–7000 mm") && lij[1].omschrijving.includes("zone I 7000–12000 mm"));
  checkTrue("melding met tabel, e en c_pe,10 (§7.2.1(1))", res.meldingen.some((m) => m.niveau === "info"
    && m.tekst.includes("tabel NB.10 – 7.4a") && m.tekst.includes("e = min(b; 2h) = min(10,00;") && m.tekst.includes("c_pe,10") && m.tekst.includes("7.2.1(1)")));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Zadeldak α = 15°, wind van rechts: gespiegeld");
{
  const res = genereerWindbelasting(zadel(15), { ...basis, richtingLinks: false, richtingRechts: true });
  const s = "wind:rechts:cpi+0.00:loef-lij-";
  // Loef is nu staaf 4 (rechts); x′ loopt vanaf x = 12 m naar links, dus op
  // staaf 4 (van de nok naar rechts) ligt G aan het eind: fractie 5/6…1.
  dakstaaf("van rechts", res, s, 4, 5, [["H", 0, 5 / 6, -0.3], ["G", 5 / 6, 1, -0.8]]);
  dakstaaf("van rechts", res, s, 3, 5, [["I", 0, 5 / 6, -0.4], ["J", 5 / 6, 1, -1.0]]);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Zadeldak α = 15°, kopgevelspant: zone F en halve belastingbreedte");
{
  const res = genereerWindbelasting(zadel(15), { ...basis, positieSpant: "kopgevelspant" });
  const s = "wind:links:cpi+0.00:loef-lij-";
  check("belastingbreedte = 2,50 m", res.samenvatting.belastingbreedte_m, 2.5);
  dakstaaf("kopgevel", res, s, 3, 2.5, [["F", 0, 1 / 6, -0.9], ["H", 1 / 6, 1, -0.3]]);
  check("F: q = 0,9·2,5 = 2,25 kN/m", lastenVan(res, s, 3)[0].q, 2.25, 1e-12);
  // Tussenspant binnen e/4 = 2,50 m van de kopgevel: ook zone F.
  const dichtbij = genereerWindbelasting(zadel(15), { ...basis, afstandTotKopgevel_m: 2 });
  checkExact("tussenspant op 2,00 m ≤ e/4: zone F", regelsVan(dichtbij, s, 3)[0].zone, "F (0,00–0,17 van de staaf)");
}

// ─────────────────────────────────────────────────────────────────────────
for (const [alpha, c] of [
  [15, { F: -1.3, G: -1.3, H: -0.6, I: -0.5 }],
  [30, { F: -1.1, G: -1.4, H: -0.8, I: -0.5 }],
  [20, { F: -1.3 + 0.2 / 3, G: -1.3 - 0.1 / 3, H: -0.6 - 0.2 / 3, I: -0.5 }],
]) {
  log(`\n[5] Zadeldak α = ${alpha}°, θ = 90° (wind haaks), tabel 7.4b`);
  const inst = { ...basis, richtingLinks: false, richtingHaaks: true };
  const tussen = genereerWindbelasting(zadel(alpha), inst);
  checkExact("één geval, sleutel zoals vóór issue #49", tussen.gevallen.map((g) => g.sleutel).join(" "), "wind:haaks:cpi+0.00");
  dakstaaf(`α=${alpha} haaks tussenspant y=5 m`, tussen, "wind:haaks:cpi+0.00", 3, 5, [["H", 0, 1, c.H]]);
  dakstaaf(`α=${alpha} haaks tussenspant y=5 m`, tussen, "wind:haaks:cpi+0.00", 4, 5, [["H", 0, 1, c.H]]);
  const ver = genereerWindbelasting(zadel(alpha), { ...inst, afstandTotKopgevel_m: 7 });
  dakstaaf(`α=${alpha} haaks y=7 m ≥ e/2`, ver, "wind:haaks:cpi+0.00", 3, 5, [["I", 0, 1, c.I]]);
  const kop = genereerWindbelasting(zadel(alpha), { ...inst, positieSpant: "kopgevelspant" });
  dakstaaf(`α=${alpha} haaks kopgevelspant`, kop, "wind:haaks:cpi+0.00", 3, 2.5, [["F", 0, 0.5, c.F], ["G", 0.5, 1, c.G]]);
  dakstaaf(`α=${alpha} haaks kopgevelspant`, kop, "wind:haaks:cpi+0.00", 4, 2.5, [["G", 0, 0.5, c.G], ["F", 0.5, 1, c.F]]);
  const o = lastenVan(kop, "wind:haaks:cpi+0.00", 3)[0].omschrijving;
  checkTrue("omschrijving θ = 90°: tabel 7.4b, e = 12000 mm, F 0–3000 mm", o.startsWith("§7.2.5 tabel 7.4b (θ = 90°") && o.includes("e = 12000 mm: zone F 0–3000 mm vanaf de linkergevel"), o);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Lessenaarsdak α = 15° (tabel 7.3a/7.3b)");
{
  const res = genereerWindbelasting(lessenaar15, { ...basis, richtingRechts: true, richtingHaaks: true });
  checkTrue("generatie geslaagd", res.ok, res.meldingen.filter((m) => m.niveau === "fout").map((m) => m.tekst).join(" | "));
  checkExact("gevallen: van links (lage rand) dak− en dak+, van rechts en haaks één",
    res.gevallen.map((g) => g.sleutel).join(" "),
    "wind:links:cpi+0.00:dak- wind:links:cpi+0.00:dak+ wind:rechts:cpi+0.00 wind:haaks:cpi+0.00");
  checkExact("naam", res.gevallen[0].naam, "Wind van links (c_pi = 0,00), dak −");
  // θ = 0°, e = min(10; 2·8,215) = 10 m ⇒ G over 0–1 000 mm = fractie 0…1/12.
  dakstaaf("lessenaar links dak−", res, "wind:links:cpi+0.00:dak-", 3, 5, [["G", 0, 1 / 12, -0.8], ["H", 1 / 12, 1, -0.3]]);
  dakstaaf("lessenaar links dak+", res, "wind:links:cpi+0.00:dak+", 3, 5, [["G", 0, 1 / 12, 0.2], ["H", 1 / 12, 1, 0.2]]);
  // θ = 180° (wind op de hoge rand): G over de laatste 1 000 mm, fractie 11/12…1.
  dakstaaf("lessenaar rechts θ=180°", res, "wind:rechts:cpi+0.00", 3, 5, [["H", 0, 11 / 12, -0.9], ["G", 11 / 12, 1, -1.3]]);
  // θ = 90°, tussenspant y = 5 m: H = −0,8.
  dakstaaf("lessenaar haaks", res, "wind:haaks:cpi+0.00", 3, 5, [["H", 0, 1, -0.8]]);
  checkTrue("omschrijving: §7.2.4 tabel 7.3a", lastenVan(res, "wind:links:cpi+0.00:dak-", 3)[0].omschrijving.startsWith("§7.2.4 tabel 7.3a (θ = 0°, α = 15,0°, rij α = 15°), e = 10000 mm: zone G 0–1000 mm"));
  checkTrue("omschrijving θ = 180°", lastenVan(res, "wind:rechts:cpi+0.00", 3)[1].omschrijving.includes("tabel 7.3a (θ = 180°"));
  // Kopgevelspant haaks: F_laag 0–3 000 mm (fractie 0…¼), G tot 9 000 mm, F_hoog.
  const kop = genereerWindbelasting(lessenaar15, { ...basis, richtingLinks: false, richtingHaaks: true, positieSpant: "kopgevelspant" });
  dakstaaf("lessenaar haaks kopgevel", kop, "wind:haaks:cpi+0.00", 3, 2.5,
    [["F_laag", 0, 0.25, -1.6], ["G", 0.25, 0.75, -1.9], ["F_hoog", 0.75, 1, -2.4]]);
  check("F_hoog: q = 2,4·2,5 = 6,00 kN/m", lastenVan(kop, "wind:haaks:cpi+0.00", 3)[2].q, 6.0, 1e-12);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Een ingevulde waarde gaat voor (en wordt als zodanig vermeld)");
{
  // Alleen het loefvlak ingevuld: loef uniform −0,50, lij automatisch.
  const res = genereerWindbelasting(zadel(15), { ...basis, cpeDakLoef: -0.5 });
  checkExact("alleen het lijvlak heeft twee tekens ⇒ twee gevallen",
    res.gevallen.map((g) => g.sleutel).join(" "), "wind:links:cpi+0.00:lij- wind:links:cpi+0.00:lij+");
  dakstaaf("loef ingevuld", res, "wind:links:cpi+0.00:lij-", 3, 5, [["loefdakvlak", 0, 1, -0.5]]);
  dakstaaf("loef ingevuld", res, "wind:links:cpi+0.00:lij-", 4, 5, [["J", 0, 1 / 6, -1.0], ["I", 1 / 6, 1, -0.4]]);
  const o = lastenVan(res, "wind:links:cpi+0.00:lij-", 3)[0].omschrijving;
  checkTrue("omschrijving: door de gebruiker ingevuld", /loefdakvlak, c_pe,10 = −0,50 door de gebruiker ingevuld/.test(o), o);
  checkTrue("melding: ingevulde waarde gaat voor", res.meldingen.some((m) => m.tekst.includes("Door de gebruiker ingevuld en voor de tabel gaand") && m.tekst.includes("c_pe loef = −0,50")));
  // Alles ingevuld: precies als vóór issue #49 — sleutel, één last per vlak, geen omschrijving.
  const hand = genereerWindbelasting(zadel(15), { ...basis, cpeDakLoef: -0.5, cpeDakLij: -0.4 });
  checkExact("alles ingevuld: sleutel zonder staartje", hand.gevallen.map((g) => g.sleutel).join(" "), "wind:links:cpi+0.00");
  checkTrue("alles ingevuld: één last per dakvlak, zonder omschrijving",
    lastenVan(hand, "wind:links:cpi+0.00", 3).length === 1 && hand.lasten.every((l) => l.omschrijving === undefined));
  checkExact("alles ingevuld: geen uitgangspunten hellend dak", hellendDakUitgangspunten(
    [{ id: 7, name: hand.gevallen[0].naam, gegenereerd: { bron: "wind", sleutel: hand.gevallen[0].sleutel } }],
    hand.lasten.map((l) => ({ caseId: 7, gegenereerdDoor: "wind", omschrijving: l.omschrijving }))), "");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] Overstek bij automatische c_pe: dakzone boven, gevel eronder");
{
  // Overstek links, 600 mm, in het verlengde van het dakvlak (α = 15°).
  const m = zadel(15);
  const z6 = 5000 - 600 * Math.tan(rad(15));
  const model = {
    ...m,
    nodes: [...m.nodes, { id: 6, x: -600, z: z6 }],
    beams: [
      { id: 1, from: 1, to: 3, loadRole: "gevelLinks" }, { id: 2, from: 2, to: 5, loadRole: "gevelRechts" },
      { id: 3, from: 3, to: 4 }, { id: 4, from: 4, to: 5 }, { id: 5, from: 6, to: 3, loadRole: "overstek" },
    ],
  };
  const res = genereerWindbelasting(model, basis);
  // h/d = 6,607695/12 = 0,550641 ⇒ c_pe,D = 0,7 + 0,1·(0,550641 − 0,25)/0,75 = 0,740085 (tabel 7.1).
  // Boven: zone G (x′ = −0,3 m < e/10), −0,8 in het negatieve geval ⇒ netto −0,8 − 0,740085 = −1,540085.
  // q = −w·B = 1,540085·5 = 7,700427 kN/m (naar buiten, opwaarts).
  const h = 5 + 6 * Math.tan(rad(15));
  const cpeD = 0.7 + 0.1 * (h / 12 - 0.25) / 0.75;
  const l = lastenVan(res, "wind:links:cpi+0.00:loef-lij-", 5);
  checkExact("overstek: één last", l.length, 1);
  check("overstek: q = (0,8 + c_pe,D)·5", l[0].q, (0.8 + cpeD) * 5, 1e-9);
  checkTrue("overstek: omschrijving met zone G boven en D onder", /zone G .*\(bovenzijde overstek\); onderzijde zone D/.test(l[0].omschrijving ?? ""), l[0].omschrijving);
  const plus = lastenVan(res, "wind:links:cpi+0.00:loef+lij-", 5);
  check("overstek, loef +: netto 0,2 − c_pe,D", plus[0].q, -(0.2 - cpeD) * 5, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[9] Evenwicht met de solver: α = 30°, loef−/lij−, zonder gevels");
{
  // Kolommen als "binnen": alleen het dak draagt wind. Hand (B = 5 m):
  //   verticaal: Σ(−c_pe)·B·(horizontale lengte) = 5·(0,5·1 + 0,2·5 + 0,5·1 + 0,4·5) = 20,00 kN omhoog
  //   horizontaal: loefvlak B·tan α·Σ(c_pe·ℓ_h) = 5·tan30°·(−0,5·1 − 0,2·5) = −4,330127
  //                lijvlak −B·tan α·Σ(c_pe·ℓ_h) = −5·tan30°·(−0,5·1 − 0,4·5) = +7,216878
  //                som +2,886751 kN (naar +x)
  const m = zadel(30);
  const model = { ...m, beams: m.beams.map((b) => (b.id <= 2 ? { ...b, loadRole: "binnen" } : b)) };
  const res = genereerWindbelasting(model, basis);
  const s = "wind:links:cpi+0.00:loef-lij-";
  const invoer = {
    nodes: model.nodes, beams: model.beams.map((b) => ({ ...b, profile: "HEA 200", material: "S235" })),
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
    loads: res.lasten.filter((l) => l.gevalSleutel === s).map((l, k) => ({
      id: k + 1, type: "lineLoad", caseId: 1, beamId: l.beamId, q: l.q, qDir: "z", qCoord: "local",
      ...(l.startFrac !== undefined ? { startFrac: l.startFrac, endFrac: l.endFrac } : {}),
    })),
    cases: [{ id: 1, name: "Wind" }],
  };
  const { perCase } = solveAllCases(invoer);
  const r = perCase.get(1);
  checkTrue("solver levert een resultaat", !!r);
  const fx = [1, 2].reduce((a, id) => a + r.reactions.get(id).fx, 0) / 1000;
  const fz = [1, 2].reduce((a, id) => a + r.reactions.get(id).fz, 0) / 1000;
  const t30 = Math.tan(rad(30));
  check("Σ reacties Fz = −20,00 kN", fz, -20.0, 1e-6);
  check("Σ reacties Fx = −2,886751 kN", fx, -(5 * t30 * (-1.5) - 5 * t30 * (-2.5)), 1e-6);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[10] Combinaties (#26) en handtekening blijven werken");
{
  const inst = { ...basis, combinatiesGenereren: true, richtingRechts: true, cpiKeuze: "beide" };
  const lc = [{ id: 1, name: "Eigen gewicht", type: "dead" }];
  const res = genereerWindbelasting(zadel(20), inst);
  checkExact("2 richtingen × 2 c_pi × 4 varianten = 16 gevallen", res.gevallen.length, 16);
  checkExact("sleutels uniek", new Set(res.gevallen.map((g) => g.sleutel)).size, 16);
  checkExact("combinaties: 16 × 4 opstellingen (alleen G) = 64", res.combinaties.length, 64);
  checkTrue("elk windgeval leidt alleen, zonder mee-gevallen",
    res.combinaties.every((c) => res.gevallen.some((g) => g.sleutel === c.windSleutel) && c.windMeeSleutels === undefined));
  // Bijhouden na een nieuw geval (combinatieBeheer) rekent uit alleen sleutel + naam.
  const nagebouwd = genereerWindCombinaties(lc, res.gevallen.map((g) => ({ sleutel: g.sleutel, naam: g.naam })));
  checkExact("genereerWindCombinaties uit sleutels en namen = de combinaties van de generator",
    JSON.stringify(nagebouwd), JSON.stringify(res.combinaties));
  // Model zoals windStore het schrijft (met omschrijving) ⇒ zelfde handtekening.
  const idVan = new Map(res.gevallen.map((g, k) => [g.sleutel, 100 + k]));
  const gevallen = [...lc, ...res.gevallen.map((g) => ({ id: idVan.get(g.sleutel), name: g.naam, type: "wind", gegenereerd: { bron: "wind", sleutel: g.sleutel } }))];
  const loads = res.lasten.map((l, k) => ({
    id: k + 1, type: "lineLoad", caseId: idVan.get(l.gevalSleutel), beamId: l.beamId, q: l.q, qDir: "z", qCoord: "local",
    ...(l.startFrac !== undefined ? { startFrac: l.startFrac, endFrac: l.endFrac } : {}),
    ...(l.omschrijving !== undefined ? { omschrijving: l.omschrijving } : {}),
    gegenereerdDoor: "wind",
  }));
  const combis = res.combinaties.map((c, k) => ({ id: k + 1, name: c.naam, type: c.type,
    factors: new Map([...c.factorenPerCaseId, [idVan.get(c.windSleutel), c.windFactor]]) }));
  checkExact("model-handtekening = generatie-handtekening (idempotent)",
    handtekeningVanModel(gevallen, loads, combis), handtekeningVanGeneratie(res.gevallen, res.lasten, res.combinaties));
  checkTrue("de handtekening ziet een andere omschrijving (α of e anders)",
    handtekeningVanModel(gevallen, loads.map((l) => (l === loads.find((x) => x.omschrijving) ? { ...l, omschrijving: l.omschrijving.replace("e = 10000", "e = 9000") } : l)), combis)
    !== handtekeningVanGeneratie(res.gevallen, res.lasten, res.combinaties));

  // Uitgangspunten (rapport en PDF): kop + per geval de omschrijvingen.
  const tekst = hellendDakUitgangspunten(gevallen, loads);
  checkTrue("uitgangspunten beginnen met de normgrondslag", tekst.startsWith(HELLEND_DAK_UITGANGSPUNT));
  checkTrue("uitgangspunten: een regel per gegenereerd geval", tekst.split("\n").length === 1 + 16);
  checkTrue("uitgangspunten noemen zonegrenzen in mm en c_pe,10",
    tekst.includes("Wind van links (c_pi = 0,20), dak loef −, lij +: §7.2.5 tabel 7.4a (θ = 0°, α = 20,0°, lineair tussen α = 15° en 30°), e = 10000 mm: zone G 0–1000 mm vanaf de loefgevel, c_pe,10 = −0,70 (negatieve waarde)"));
  checkExact("windUitgangspunten = vrijstaand (leeg) + hellend", windUitgangspunten(gevallen, loads), tekst);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
