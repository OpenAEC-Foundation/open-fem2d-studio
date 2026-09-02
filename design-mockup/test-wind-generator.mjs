// Windbelastinggenerator — geometrie, zone-indeling, tekens, weigeringen,
// combinaties en idempotentie. Sluit af met een evenwichtscontrole door de
// echte solver.
//
// REFERENTIEMODEL (portaal, plat dak):
//     3 ●───────────────● 4      z = 6000
//       │               │
//       │ staaf1        │ staaf2
//     1 ●               ● 2      z = 0
//     x = 0          x = 12000
//   staaf 3 = dak 3→4
//   ⇒ h = 6,00 m ; d = 12,00 m ; h/d = 0,50
//
// Instellingen in de handberekeningen: q_p = 1,000 kN/m² (handmatig, zodat de
// getallen exact zijn), belastingbreedte 5,00 m, gebouwlengte 30 m,
// tussenspant op 15 m van de kopgevel.
//
// HANDBEREKENINGEN
//   (a) Vormfactoren wand bij h/d = 0,50 (tabel 7.1, lineair):
//         c_pe,D = +0,733333   c_pe,E = −0,366667
//   (b) Wind van links, c_pi = −0,30:
//         loefgevel  w = 1,000·(+0,733333 + 0,30) = +1,033333 kN/m²
//                    q = 1,033333 · 5,00 = 5,166667 kN/m   (naar +x)
//         lijgevel   w = 1,000·(−0,366667 + 0,30) = −0,066667 kN/m²
//                    q = 0,333333 kN/m                      (naar +x)
//         som horizontaal = 5,50 kN/m gevelhoogte
//   (c) Zelfde met c_pi = +0,20:
//         loef  w = +0,533333 → q = 2,666667 kN/m
//         lij   w = −0,566667 → q = 2,833333 kN/m
//         som   = 5,50 kN/m  →  de inwendige druk valt horizontaal weg
//         (invariant: som = q_p·(c_pe,D − c_pe,E)·b = 1,0·1,10·5 = 5,50)
//   (d) Plat dak, e = min(30; 2·6) = 12 m ⇒ zonegrenzen op e/10 = 1,20 m en
//       e/2 = 6,00 m. Spant op 15 m > e/4 = 3 m ⇒ randzone G (niet F).
//         zone G (0,00–1,20 m): c_pe = −1,20 → w = −0,90 → q = 4,50 kN/m ↑
//         zone H (1,20–6,00 m): c_pe = −0,70 → w = −0,40 → q = 2,00 kN/m ↑
//         zone I (6,00–12,00 m): c_pe = −0,20 → w = +0,10 → q = 0,50 kN/m ↓
//       netto opwaartse dakkracht
//         = 5·1,0·[1,20·(−0,90) + 4,80·(−0,40) + 6,00·(+0,10)]
//         = 5·(−1,08 − 1,92 + 0,60) = 5·(−2,40) = −12,00 kN  ⇒ 12,00 kN ↑
//   (e) Totale horizontale kracht op het spant (evenwicht):
//         5,50 kN/m · 6,00 m = 33,00 kN
//
// Draaien met: npx tsx test-wind-generator.mjs

const {
  genereerWindbelasting, STANDAARD_WIND_INSTELLINGEN,
  handtekeningVanGeneratie, handtekeningVanModel, WIND_COMBI_PREFIX,
} = await import("./src/lib/wind/windGenerator.ts");
const { bepaalStandaardRol, rolVanStaaf } =
  await import("./src/components/fem/femTypes.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, actual, expected, tolPct = 0.001) {
  const tol = Math.abs(expected) * tolPct / 100 + 1e-9;
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(6)} ≈ ${expected}`); }
  else { failed++; log(`  ✗ ${name}: ${actual} vs ${expected}`); }
}
function kort(v) {
  const s = JSON.stringify(v);
  return s !== undefined && s.length > 120 ? s.slice(0, 117) + "…" : s;
}
function checkExact(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { passed++; log(`  ✓ ${name}: ${kort(actual)}`); }
  else { failed++; log(`  ✗ ${name}: ${kort(actual)} vs ${kort(expected)}`); }
}
function checkTrue(name, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${name}${extra ? " — " + extra : ""}`); }
  else { failed++; log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

// ── Referentiemodellen ───────────────────────────────────────────────────
const portaalNodes = [
  { id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 },
  { id: 3, x: 0, z: 6000 }, { id: 4, x: 12000, z: 6000 },
];
const portaalBeams = [
  { id: 1, from: 1, to: 3 },
  { id: 2, from: 2, to: 4 },
  { id: 3, from: 3, to: 4 },
];
const basisGevallen = [{ id: 1, name: "Eigen gewicht", type: "dead" }];

const basis = {
  ...STANDAARD_WIND_INSTELLINGEN,
  stuwdrukBron: "handmatig", qpHandmatig_kNm2: 1.0,
  richtingLinks: true, richtingRechts: false, richtingHaaks: false,
  cpiKeuze: "min",             // c_pi = −0,30
  hohSpant_m: 5, positieSpant: "tussenspant", belastingbreedteOverride_m: null,
  gebouwlengte_m: 30, afstandTotKopgevel_m: 15,
  combinatiesGenereren: false,
};

const som = (arr) => arr.reduce((a, b) => a + b, 0);
const lastenVan = (res, beamId) => res.lasten.filter((l) => l.beamId === beamId);

// ─────────────────────────────────────────────────────────────────────────
log("\n[0] Belastingtype uit de geometrie");
{
  checkExact("linkerkolom → gevelLinks", bepaalStandaardRol(portaalBeams[0], portaalNodes), "gevelLinks");
  checkExact("rechterkolom → gevelRechts", bepaalStandaardRol(portaalBeams[1], portaalNodes), "gevelRechts");
  checkExact("horizontale bovenstaaf → dakPlat", bepaalStandaardRol(portaalBeams[2], portaalNodes), "dakPlat");
  // Binnenkolom: staat niet op de rand.
  const nodes = [...portaalNodes, { id: 5, x: 6000, z: 0 }, { id: 6, x: 6000, z: 6000 }];
  checkExact("middenkolom → binnen", bepaalStandaardRol({ from: 5, to: 6 }, nodes), "binnen");
  // Hellend dak.
  const zadel = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 },
    { id: 3, x: 0, z: 5000 }, { id: 4, x: 6000, z: 7000 }, { id: 5, x: 12000, z: 5000 },
  ];
  checkExact("dakschild 3→4 → dakHellend", bepaalStandaardRol({ from: 3, to: 4 }, zadel), "dakHellend");
  checkExact("dakschild 4→5 → dakHellend", bepaalStandaardRol({ from: 4, to: 5 }, zadel), "dakHellend");
  // Vloerbalk halverwege: horizontaal maar niet op dakhoogte.
  const metVloer = [...portaalNodes, { id: 5, x: 0, z: 3000 }, { id: 6, x: 12000, z: 3000 }];
  checkExact("tussenvloer → vloer", bepaalStandaardRol({ from: 5, to: 6 }, metVloer), "vloer");
  // Handmatige rol wint altijd.
  checkExact("expliciete rol overschrijft",
    rolVanStaaf({ id: 9, from: 1, to: 3, loadRole: "binnen" }, portaalNodes), "binnen");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Wind van links, c_pi = −0,30 — handberekening (b) en (d)");
let refRes = null;
{
  const res = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen }, basis);
  refRes = res;
  checkTrue("generatie geslaagd", res.ok, res.meldingen.map((m) => m.niveau).join(","));
  checkExact("één belastinggeval", res.gevallen.length, 1);
  checkExact("geval-sleutel is stabiel", res.gevallen[0].sleutel, "wind:links:cpi-0.30");
  check("h/d", res.samenvatting.hOverD, 0.5);
  check("belastingbreedte [m]", res.samenvatting.belastingbreedte_m, 5);

  // (b) loefgevel — staaf 1 loopt van (0,0) naar (0,6000): lokale +z wijst
  //     naar −x, dus een druk naar +x geeft een NEGATIEVE lokale q.
  const l1 = lastenVan(res, 1);
  checkExact("loefgevel: één lijnlast", l1.length, 1);
  check("loefgevel q (lokale z)", l1[0].q, -5.1666667, 0.001);
  // (b) lijgevel — staaf 2 van (12000,0) naar (12000,6000): lokale +z wijst
  //     ook naar −x; zuiging trekt naar +x ⇒ eveneens negatief.
  const l2 = lastenVan(res, 2);
  checkExact("lijgevel: één lijnlast", l2.length, 1);
  check("lijgevel q (lokale z)", l2[0].q, -0.3333333, 0.001);
  // Invariant: de horizontale som is onafhankelijk van c_pi.
  check("som horizontaal [kN/m]", Math.abs(l1[0].q) + Math.abs(l2[0].q), 5.5, 0.001);

  // (d) dakzones als deellasten op staaf 3.
  const l3 = lastenVan(res, 3).sort((a, b) => (a.startFrac ?? 0) - (b.startFrac ?? 0));
  checkExact("dak: drie zonebanden", l3.length, 3);
  check("zone G eindfractie = 1,20/12,00", l3[0].endFrac, 0.1);
  check("zone H fracties 0,10–0,50", l3[1].startFrac, 0.1);
  check("zone H eindfractie", l3[1].endFrac, 0.5);
  check("zone I startfractie", l3[2].startFrac, 0.5);
  check("zone G q (opwaarts, +lokale z)", l3[0].q, 4.5);
  check("zone H q", l3[1].q, 2.0);
  check("zone I q (neerwaarts)", l3[2].q, -0.5);
  const opwaarts = som(l3.map((l) =>
    l.q * ((l.endFrac ?? 1) - (l.startFrac ?? 0)) * 12));
  check("netto opwaartse dakkracht [kN]", opwaarts, 12.0, 0.001);
  checkTrue("elke last draagt een toelichting met c_pe en bron",
    res.lasten.every((l) => /c_pe/.test(l.toelichting)));
  checkTrue("elke samenvattingsregel draagt een normbron",
    res.samenvatting.perGeval[0].regels.every((r) => /EN 1991-1-4/.test(r.bron)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] c_pi = +0,20 — handberekening (c); horizontale som blijft gelijk");
{
  const res = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen },
    { ...basis, cpiKeuze: "plus" });
  const l1 = lastenVan(res, 1)[0], l2 = lastenVan(res, 2)[0];
  check("loefgevel q", l1.q, -2.6666667, 0.001);
  check("lijgevel q", l2.q, -2.8333333, 0.001);
  check("som horizontaal blijft 5,50 kN/m", Math.abs(l1.q) + Math.abs(l2.q), 5.5, 0.001);
  // Dak: grotere zuiging bij overdruk binnen.
  const l3 = lastenVan(res, 3).sort((a, b) => (a.startFrac ?? 0) - (b.startFrac ?? 0));
  check("zone G q bij c_pi=+0,20", l3[0].q, 7.0);   // 1,0·(−1,2−0,2)·5 = −7 kN/m²·m ⇒ +7 lokaal
  check("zone I q bij c_pi=+0,20", l3[2].q, 2.0);   // 1,0·(−0,2−0,2)·5 = −2 ⇒ +2 lokaal
}

log("\n[3] c_pi “beide” geeft twee afzonderlijke belastinggevallen (§7.2.9)");
{
  const res = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen },
    { ...basis, cpiKeuze: "beide", richtingRechts: true });
  checkExact("2 richtingen × 2 c_pi = 4 gevallen", res.gevallen.length, 4);
  checkExact("sleutels uniek", new Set(res.gevallen.map((g) => g.sleutel)).size, 4);
  checkTrue("alle gevallen hebben lasten",
    res.gevallen.every((g) => res.lasten.some((l) => l.gevalSleutel === g.sleutel)));
}

log("\n[4] Wind van rechts spiegelt de gevelrollen");
{
  const res = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen },
    { ...basis, richtingLinks: false, richtingRechts: true });
  const l1 = lastenVan(res, 1)[0], l2 = lastenVan(res, 2)[0];
  // Nu is de RECHTERgevel loef: q = +5,166667 (lokale +z wijst naar −x).
  check("rechtergevel is nu loef", l2.q, 5.1666667, 0.001);
  check("linkergevel is nu lij", l1.q, 0.3333333, 0.001);
  // Dakzones spiegelen: zone G ligt nu aan de rechterkant van staaf 3.
  const l3 = lastenVan(res, 3).sort((a, b) => (a.startFrac ?? 0) - (b.startFrac ?? 0));
  check("zone I ligt nu vooraan (fractie 0)", l3[0].endFrac, 0.5);
  check("zone G ligt nu achteraan", l3[2].startFrac, 0.9);
  check("zone G q ongewijzigd van grootte", l3[2].q, 4.5);
}

log("\n[5] Kopgevelspant: halve belastingbreedte én randzone F");
{
  const res = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen },
    { ...basis, positieSpant: "kopgevelspant", afstandTotKopgevel_m: 0 });
  check("belastingbreedte = h.o.h./2", res.samenvatting.belastingbreedte_m, 2.5);
  const l3 = lastenVan(res, 3).sort((a, b) => (a.startFrac ?? 0) - (b.startFrac ?? 0));
  // zone F: c_pe = −1,8 ⇒ w = 1,0·(−1,8+0,3) = −1,5 ⇒ q = 1,5·2,5 = 3,75 ↑
  check("randzone F i.p.v. G", l3[0].q, 3.75);
  checkTrue("samenvatting noemt zone F",
    res.samenvatting.perGeval[0].regels.some((r) => r.zone.startsWith("F")));
}

log("\n[6] Weigeringen — de generator verzint geen vormfactoren");
{
  const zadelNodes = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 },
    { id: 3, x: 0, z: 5000 }, { id: 4, x: 6000, z: 7000 }, { id: 5, x: 12000, z: 5000 },
  ];
  const zadelBeams = [
    { id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 5 },
    { id: 3, from: 3, to: 4 }, { id: 4, from: 4, to: 5 },
  ];
  const zonder = genereerWindbelasting(
    { nodes: zadelNodes, beams: zadelBeams, loadCases: basisGevallen }, basis);
  checkExact("hellend dak zonder c_pe → geweigerd", zonder.ok, false);
  checkExact("geen lasten aangemaakt", zonder.lasten.length, 0);
  checkTrue("de melding verwijst naar tabel 7.4a",
    zonder.meldingen.some((m) => m.niveau === "fout" && /7\.4a/.test(m.tekst)));

  const metWaarden = genereerWindbelasting(
    { nodes: zadelNodes, beams: zadelBeams, loadCases: basisGevallen },
    { ...basis, cpeDakLoef: 0.3, cpeDakLij: -0.6 });
  checkExact("mét ingevulde c_pe → geslaagd", metWaarden.ok, true);
  // Loefvlak = staaf 3 (midden x = 3000 < nok x = 6000) bij wind van links.
  // w = 1,0·(0,30 + 0,30) = 0,60 kN/m² ⇒ q = 3,00 kN/m, drukkend (negatief).
  check("loefdakvlak q", lastenVan(metWaarden, 3)[0].q, -3.0, 0.001);
  // Lijvlak = staaf 4: w = 1,0·(−0,60 + 0,30) = −0,30 ⇒ q = 1,50 kN/m zuiging.
  check("lijdakvlak q", lastenVan(metWaarden, 4)[0].q, 1.5, 0.001);
  checkTrue("bron vermeldt dat de gebruiker de waarde gaf",
    metWaarden.samenvatting.perGeval[0].regels
      .some((r) => /door de gebruiker ingevuld/.test(r.bron)));

  // Haaks + hellend dak zonder tabel 7.4b → weigeren.
  const haaks = genereerWindbelasting(
    { nodes: zadelNodes, beams: zadelBeams, loadCases: basisGevallen },
    { ...basis, cpeDakLoef: 0.3, cpeDakLij: -0.6, richtingHaaks: true });
  checkExact("haaks zonder 7.4b → geweigerd", haaks.ok, false);
  checkTrue("melding verwijst naar tabel 7.4b",
    haaks.meldingen.some((m) => m.niveau === "fout" && /7\.4b/.test(m.tekst)));

  // Geen windvlak → weigeren met uitleg.
  const alleenBinnen = genereerWindbelasting({
    nodes: portaalNodes,
    beams: portaalBeams.map((b) => ({ ...b, loadRole: "binnen" })),
    loadCases: basisGevallen,
  }, basis);
  checkExact("model zonder windvlak → geweigerd", alleenBinnen.ok, false);
  checkTrue("melding legt uit wat te doen",
    alleenBinnen.meldingen.some((m) => m.niveau === "fout" && /belastingtype/.test(m.tekst)));

  // Geen richting gekozen.
  const geenRichting = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen },
    { ...basis, richtingLinks: false, richtingRechts: false, richtingHaaks: false });
  checkExact("geen windrichting → geweigerd", geenRichting.ok, false);
}

log("\n[7] Waarschuwingen die hardop gezegd moeten worden");
{
  const res = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen },
    { ...basis, stuwdrukBron: "berekend" });
  checkTrue("berekende stuwdruk waarschuwt voor de NB-tabel",
    res.meldingen.some((m) => m.niveau === "waarschuwing" && /nationale bijlage/.test(m.tekst)));
  checkTrue("zone I ±0,2 wordt expliciet gemeld",
    res.meldingen.some((m) => /Zone I/.test(m.tekst)));
  checkTrue("referentiehoogte z_e = h wordt verantwoord",
    res.meldingen.some((m) => /Referentiehoogte/.test(m.tekst)));
  // Klein belast vlak → waarschuwing over c_pe,10 (§7.2.1(1)).
  const smal = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen },
    { ...basis, belastingbreedteOverride_m: 0.5 });
  checkTrue("klein vlak → waarschuwing c_pe,10",
    smal.meldingen.some((m) => /7\.2\.1\(1\)/.test(m.tekst)));
  // Hoog gebouw → c_s·c_d-waarschuwing.
  const hoog = genereerWindbelasting({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 },
      { id: 3, x: 0, z: 18000 }, { id: 4, x: 12000, z: 18000 }],
    beams: portaalBeams, loadCases: basisGevallen,
  }, basis);
  checkTrue("h ≥ 15 m → c_s·c_d-waarschuwing",
    hoog.meldingen.some((m) => /c_s·c_d/.test(m.tekst)));
}

log("\n[8] Wind haaks: alleen zuiging, conservatief per zone");
{
  const res = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen },
    { ...basis, richtingLinks: false, richtingHaaks: true, afstandTotKopgevel_m: 1 });
  checkExact("geslaagd", res.ok, true);
  // e_haaks = min(d; 2h) = min(12; 12) = 12 ⇒ zone A tot 12/5 = 2,4 m.
  // Spant op 1 m ⇒ zone A: c_pe = −1,2, w = 1,0·(−1,2+0,3) = −0,90,
  // q = 0,90·5 = 4,50 kN/m zuiging op BEIDE gevels.
  const l1 = lastenVan(res, 1)[0], l2 = lastenVan(res, 2)[0];
  check("linkergevel zuiging", l1.q, 4.5, 0.001);
  check("rechtergevel zuiging", l2.q, -4.5, 0.001);
  checkTrue("beide gevels trekken naar buiten",
    Math.sign(l1.q) !== Math.sign(l2.q));
  checkTrue("melding legt de grovere aanpak uit",
    res.meldingen.some((m) => /haaks/.test(m.tekst) && m.niveau === "waarschuwing"));
}

log("\n[9] Combinaties (EN 1990) met vindplaats");
{
  const gevallen = [
    { id: 1, name: "Eigen gewicht", type: "dead" },
    { id: 2, name: "Veranderlijk", type: "live" },
    { id: 3, name: "Sneeuw", type: "snow" },
  ];
  const res = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: gevallen },
    { ...basis, combinatiesGenereren: true });
  checkExact("4 combinaties per windgeval", res.combinaties.length, 4);
  checkTrue("alle namen dragen het generatorvoorvoegsel",
    res.combinaties.every((c) => c.naam.startsWith(WIND_COMBI_PREFIX)));
  const a = res.combinaties.find((c) => c.naam.includes("6.10a"));
  const b = res.combinaties.find((c) => c.naam.includes("6.10b"));
  const equ = res.combinaties.find((c) => c.naam.includes("EQU"));
  const bgt = res.combinaties.find((c) => c.type === "sls");
  check("6.10a: γ_G = 1,35", a.factorenPerCaseId.find(([id]) => id === 1)[1], 1.35);
  check("6.10a: 1,5·ψ₀,W = 0,90", a.windFactor, 0.9);
  check("6.10a: 1,5·ψ₀,Q = 1,05", a.factorenPerCaseId.find(([id]) => id === 2)[1], 1.05);
  check("6.10a: 1,5·ψ₀,S = 0,75", a.factorenPerCaseId.find(([id]) => id === 3)[1], 0.75);
  check("6.10b: γ_G = 1,20", b.factorenPerCaseId.find(([id]) => id === 1)[1], 1.2);
  check("6.10b: wind leidend γ_Q = 1,50", b.windFactor, 1.5);
  check("EQU: γ_G,inf = 0,90", equ.factorenPerCaseId.find(([id]) => id === 1)[1], 0.9);
  check("EQU: wind 1,50", equ.windFactor, 1.5);
  checkExact("EQU bevat geen Q of S", equ.factorenPerCaseId.length, 1);
  check("BGT karakteristiek: ψ₀,Q = 0,70", bgt.factorenPerCaseId.find(([id]) => id === 2)[1], 0.7);
  check("BGT karakteristiek: ψ₀,S = 0,50", bgt.factorenPerCaseId.find(([id]) => id === 3)[1], 0.5);
  checkTrue("formule noemt de vindplaats van γ en ψ₀",
    res.combinaties.every((c) => /A1\.2\(B\)/.test(c.formule) && /A1\.1/.test(c.formule)));
  checkTrue("K_FI-beperking wordt hardop gemeld",
    res.meldingen.some((m) => /K_FI/.test(m.tekst)));
  // Belastinggeval met type "overig" wordt niet stil meegenomen.
  const metOverig = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams,
      loadCases: [...gevallen, { id: 4, name: "Onbekend", type: "other" }] },
    { ...basis, combinatiesGenereren: true });
  checkTrue("“overig” wordt gemeld en overgeslagen",
    metOverig.meldingen.some((m) => /overig/.test(m.tekst)));
  checkTrue("geen factor voor het overige geval",
    metOverig.combinaties.every((c) => !c.factorenPerCaseId.some(([id]) => id === 4)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[10] Idempotentie — twee keer genereren geeft exact hetzelfde");
{
  const invoer = { nodes: portaalNodes, beams: portaalBeams, loadCases: basisGevallen };
  const inst = { ...basis, cpiKeuze: "beide", richtingRechts: true, combinatiesGenereren: true };
  const r1 = genereerWindbelasting(invoer, inst);
  const r2 = genereerWindbelasting(invoer, inst);
  const h = (r) => handtekeningVanGeneratie(
    r.gevallen.map((g) => ({ sleutel: g.sleutel, naam: g.naam })), r.lasten, r.combinaties);
  checkExact("handtekeningen identiek", h(r1), h(r2));

  // Simuleer de winkel: ken id's toe zoals windStore dat doet en lees de
  // handtekening terug uit het "model". Die moet gelijk zijn aan de
  // handtekening van een VOLGENDE generatie — dan schrijft de store niets.
  const idVan = new Map();
  let volgendId = 2;
  for (const g of r1.gevallen) idVan.set(g.sleutel, volgendId++);
  const modelGevallen = [
    ...basisGevallen,
    ...r1.gevallen.map((g) => ({
      id: idVan.get(g.sleutel), name: g.naam, type: "wind",
      gegenereerd: { bron: "wind", sleutel: g.sleutel },
    })),
  ];
  let lastId = 100;
  const modelLasten = [
    // Handmatige last die NIET van de generator is — moet genegeerd worden.
    { id: 1, type: "lineLoad", caseId: 1, beamId: 3, q: -2.5, qDir: "z" },
    ...r1.lasten.map((l) => ({
      id: lastId++, type: "lineLoad", caseId: idVan.get(l.gevalSleutel),
      beamId: l.beamId, q: l.q, qDir: "z", qCoord: "local",
      ...(l.startFrac !== undefined ? { startFrac: l.startFrac, endFrac: l.endFrac } : {}),
      gegenereerdDoor: "wind",
    })),
  ];
  let comboId = 50;
  const modelCombis = [
    { id: 1, name: "ULS 6.10a", type: "uls", factors: new Map([[1, 1.35]]) },
    ...r1.combinaties.map((c) => ({
      id: comboId++, name: c.naam, type: c.type,
      factors: new Map([...c.factorenPerCaseId, [idVan.get(c.windSleutel), c.windFactor]]),
    })),
  ];
  const r3 = genereerWindbelasting(
    { nodes: portaalNodes, beams: portaalBeams, loadCases: modelGevallen }, inst);
  checkExact("model-handtekening = generatie-handtekening",
    handtekeningVanModel(modelGevallen, modelLasten, modelCombis), h(r3));
  checkTrue("handmatige last telt niet mee in de handtekening",
    !handtekeningVanModel(modelGevallen, modelLasten, modelCombis).includes("-2.5"));

  // Een wijziging in de constructie MOET wél een andere handtekening geven.
  const hoger = genereerWindbelasting({
    nodes: portaalNodes.map((n) => (n.z > 0 ? { ...n, z: 7000 } : n)),
    beams: portaalBeams, loadCases: modelGevallen,
  }, inst);
  checkTrue("gewijzigde constructie ⇒ andere handtekening", h(hoger) !== h(r3));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[11] Evenwicht door de echte solver — handberekening (e)");
{
  const res = refRes; // wind van links, c_pi = −0,30
  const E = 210000, A = 3880, I = 16700000; // HEA160-achtig, willekeurig
  const invoer = {
    nodes: portaalNodes,
    beams: portaalBeams.map((b) => ({ ...b, E, A, I })),
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
    loads: res.lasten.map((l) => ({
      beamId: l.beamId, q: l.q, qDir: "z", qCoord: "local", caseId: 1,
      ...(l.startFrac !== undefined ? { startFrac: l.startFrac, endFrac: l.endFrac } : {}),
    })),
    cases: [{ id: 1, name: "Wind links" }],
  };
  const { perCase } = solveAllCases(invoer);
  const r = perCase.get(1);
  checkTrue("solver levert een resultaat", !!r);
  const fx = som([1, 2].map((id) => r.reactions.get(id).fx));
  const fz = som([1, 2].map((id) => r.reactions.get(id).fz));
  // Reacties in N; aangebrachte horizontale kracht = 5,50 kN/m · 6,00 m = 33 kN.
  check("Σ reacties Fx = −33,0 kN (evenwicht)", fx / 1000, -33.0, 0.05);
  // Netto opwaartse dakkracht 12,0 kN ⇒ reacties moeten 12,0 kN omlaag geven.
  check("Σ reacties Fz = −12,0 kN (evenwicht)", fz / 1000, -12.0, 0.05);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
