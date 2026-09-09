// De scheefstand φ volgens de norm in plaats van één vast getal.
//
// Wat hier wordt bewaakt, in deze volgorde:
//   1. de formules zelf — EN 1993-1-1 (5.5), EN 1992-1-1 (5.1) met de
//      Nederlandse NB-basiswaarde 1/300, en EN 1995-1-1 (5.1) voor hout;
//   2. de afleiding van h en m uit het model, met het onderscheid tussen een
//      portaal (twee kolommen) en een rij kolommen dat de norm maakt;
//   3. DE HARDE EIS: een bestaand project verandert niet stil. Zonder
//      `bron` — élk projectbestand van vóór deze keuze — komt er exact
//      1/noemer uit, tot op de bit;
//   4. dat de normwaarde nooit GROTER is dan de vaste basiswaarde 1/200, want
//      dat is precies waarom stilzwijgend overschakelen gevaarlijk zou zijn;
//   5. de aansluiting op de motor: de afgeleide φ levert werkelijk
//      H = φ·V aan vervangende horizontale kracht.
import {
  alphaH,
  alphaM,
  bepaalScheefstand,
  leidScheefstandGeometrieAf,
  phiVolgensNorm,
  scheefstandToelichting,
  toepasselijkeScheefstandNormen,
  SCHEEFSTAND_BRONNEN,
} from "./src/lib/scheefstandNorm.ts";
import { solveAllCases } from "./src/components/fem/solver/engine.ts";

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(naam, gemeten, verwacht, tolPct = 0.01) {
  const tol = Math.abs(verwacht) * tolPct / 100 + 1e-12;
  if (Math.abs(gemeten - verwacht) <= tol) {
    passed++; log(`  ✓ ${naam}: ${gemeten} ≈ ${verwacht}`);
  } else {
    failed++; log(`  ✗ ${naam}: ${gemeten} vs ${verwacht}`);
  }
}
function waar(naam, voorwaarde, uitleg = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${uitleg ? ` — ${uitleg}` : ""}`); }
}

// ── 1. De reductiefactoren afzonderlijk ──────────────────────────────────────
log("\n[1] α_h = 2/√h met 2/3 ≤ α_h ≤ 1,0 — EN 1993-1-1 (5.5) / EN 1992-1-1 (5.1)");
{
  check("h = 4 m → α_h = 1,0 (precies op de bovengrens)", alphaH(4).waarde, 1);
  check("h = 9 m → α_h = 2/3 (precies op de ondergrens)", alphaH(9).waarde, 2 / 3);
  check("h = 6 m → α_h = 2/√6", alphaH(6).waarde, 2 / Math.sqrt(6));
  check("h = 1 m → begrensd op 1,0", alphaH(1).waarde, 1);
  check("h = 25 m → begrensd op 2/3", alphaH(25).waarde, 2 / 3);
  waar("h = 1 m meldt de bovengrens", alphaH(1).begrensd === "boven");
  waar("h = 25 m meldt de ondergrens", alphaH(25).begrensd === "onder");
  waar("h = 6 m is niet begrensd", alphaH(6).begrensd === null);
  // h = 0 zou 2/√0 = ∞ geven; de bovengrens vangt dat af.
  check("h = 0 (vlak model) → α_h = 1,0 en geen NaN", alphaH(0).waarde, 1);
}

log("\n[2] α_m = √(0,5·(1 + 1/m)) — EN 1993-1-1 (5.5) / EN 1992-1-1 (5.1)");
{
  check("m = 1 → α_m = 1,0", alphaM(1), 1);
  check("m = 2 (portaal) → α_m = √0,75", alphaM(2), Math.sqrt(0.75));
  check("m = 5 (rij kolommen) → α_m = √0,6", alphaM(5), Math.sqrt(0.6));
  waar("α_m daalt met m", alphaM(2) > alphaM(5));
  check("m = 0 wordt op 1 begrensd (geen deling door nul)", alphaM(0), 1);
}

// ── 2. De drie normen naast elkaar, zelfde constructie ───────────────────────
log("\n[3] Dezelfde constructie (h = 9 m, m = 2) door de drie normen");
{
  const staal = phiVolgensNorm("en1993", 9, 2);
  const beton = phiVolgensNorm("en1992", 9, 2);
  const hout  = phiVolgensNorm("en1995", 9, 2);

  // EN 1993-1-1 (5.5): φ = 1/200 · 2/3 · √0,75
  check("EN 1993 φ", staal.phi, (1 / 200) * (2 / 3) * Math.sqrt(0.75));
  check("EN 1993 als 1/x", 1 / staal.phi, 346.410, 0.01);
  // EN 1992-1-1 (5.1) met de Nederlandse NB: θ₀ = 1/300, niet de aanbevolen
  // EN-waarde 1/200 (die is in de NB doorgehaald).
  check("EN 1992 θ_i (NB: θ₀ = 1/300)", beton.phi, (1 / 300) * (2 / 3) * Math.sqrt(0.75));
  check("EN 1992 als 1/x", 1 / beton.phi, 519.615, 0.01);
  // EN 1995-1-1 (5.1): geen α_m en geen ondergrens op de hoogtereductie.
  check("EN 1995 φ = 0,005·√(5/h)", hout.phi, 0.005 * Math.sqrt(5 / 9));
  check("EN 1995 als 1/x", 1 / hout.phi, 268.328, 0.01);
  waar("hout geeft de grootste φ van de drie bij h = 9 m",
    hout.phi > staal.phi && staal.phi > beton.phi);
  waar("elke norm noemt zijn artikel in de tussenwaarden",
    staal.regels.some((r) => r.artikel.includes("EN 1993-1-1")) &&
    beton.regels.some((r) => r.artikel.includes("EN 1992-1-1")) &&
    hout.regels.some((r) => r.artikel.includes("EN 1995-1-1")));
  waar("EN 1995 kent geen α_m", !hout.regels.some((r) => r.symbool === "α_m"));
}

log("\n[4] EN 1995-1-1 (5.1): de knik bij h = 5 m");
{
  check("h = 3 m → φ = 0,005", phiVolgensNorm("en1995", 3, 1).phi, 0.005);
  check("h = 5 m → φ = 0,005 (nog net de eerste tak)", phiVolgensNorm("en1995", 5, 1).phi, 0.005);
  check("h = 20 m → φ = 0,005·√(5/20) = 0,0025", phiVolgensNorm("en1995", 20, 1).phi, 0.0025);
  waar("m doet in EN 1995 niets",
    phiVolgensNorm("en1995", 9, 1).phi === phiVolgensNorm("en1995", 9, 12).phi);
}

log("\n[5] Geen enkele norm komt boven de basiswaarde 1/200 uit");
{
  // Dit is de reden dat de normberekening een KEUZE is en niet de nieuwe
  // standaard: overschakelen maakt de scheefstand altijd kleiner, nooit groter.
  let hoogste = 0;
  for (const h of [0, 1, 2, 4, 5, 6, 9, 12, 20, 40, 100]) {
    for (const m of [1, 2, 3, 5, 10, 50]) {
      for (const norm of ["en1993", "en1992", "en1995"]) {
        hoogste = Math.max(hoogste, phiVolgensNorm(norm, h, m).phi);
      }
    }
  }
  check("hoogste φ over de hele sweep = 1/200", hoogste, 0.005);
  check("ongunstigste combinatie (h ≤ 4, m = 1) haalt de basiswaarde",
    phiVolgensNorm("en1993", 4, 1).phi, 0.005);
  check("EN 1993 kan tot 2/3·√0,5 van de basiswaarde zakken",
    phiVolgensNorm("en1993", 100, 1000).phi, 0.005 * (2 / 3) * Math.sqrt(0.5 * (1 + 1 / 1000)));
}

// ── 3. h en m uit het model ─────────────────────────────────────────────────
const portaal = {
  nodes: [
    { id: 1, x: 0,    z: 0 },
    { id: 2, x: 0,    z: 4000 },
    { id: 3, x: 6000, z: 4000 },
    { id: 4, x: 6000, z: 0 },
  ],
  beams: [
    { id: 1, from: 1, to: 2 },   // linkerkolom
    { id: 2, from: 2, to: 3 },   // ligger
    { id: 3, from: 4, to: 3 },   // rechterkolom
  ],
  supports: [{ nodeId: 1 }, { nodeId: 4 }],
};

log("\n[6] Portaal 6 × 4 m → h = 4,0 m en m = 2 (twee kolommen, niet drie staven)");
{
  const g = leidScheefstandGeometrieAf(portaal);
  check("h", g.hoogteM, 4);
  check("m", g.aantalElementen, 2);
  waar("afleidbaar", g.afleidbaar);
  waar("de ligger telt niet als kolom", g.kolomlijnen.length === 2);
  waar("de afleiding noemt de voet én de bovenkant",
    g.afleiding[0].includes("voet") && g.afleiding[0].includes("bovenkant"));
  waar("de afleiding waarschuwt over het 50 %-criterium",
    g.afleiding.some((r) => r.includes("50 %")));
}

log("\n[7] Tweelaags portaal → nog steeds m = 2: één kolom door twee lagen telt één keer");
{
  const tweelaags = {
    nodes: [
      ...portaal.nodes,
      { id: 5, x: 0,    z: 8000 },
      { id: 6, x: 6000, z: 8000 },
    ],
    beams: [
      ...portaal.beams,
      { id: 4, from: 2, to: 5 },   // linkerkolom, tweede laag
      { id: 5, from: 5, to: 6 },   // dakligger
      { id: 6, from: 3, to: 6 },   // rechterkolom, tweede laag
    ],
    supports: portaal.supports,
  };
  const g = leidScheefstandGeometrieAf(tweelaags);
  check("h loopt door tot de nok", g.hoogteM, 8);
  check("m = 2 en niet 4", g.aantalElementen, 2);
  waar("elke kolomlijn bestaat uit twee staven",
    g.kolomlijnen.every((k) => k.staafIds.length === 2));
}

log("\n[8] Rij van vijf kolommen → m = 5 (dít is wat een portaal onderscheidt)");
{
  const nodes = [];
  const beams = [];
  const supports = [];
  for (let i = 0; i < 5; i++) {
    nodes.push({ id: 100 + i, x: i * 5000, z: 0 });
    nodes.push({ id: 200 + i, x: i * 5000, z: 3000 });
    beams.push({ id: 10 + i, from: 100 + i, to: 200 + i });
    supports.push({ nodeId: 100 + i });
    if (i > 0) beams.push({ id: 50 + i, from: 200 + i - 1, to: 200 + i });
  }
  const g = leidScheefstandGeometrieAf({ nodes, beams, supports });
  check("h", g.hoogteM, 3);
  check("m", g.aantalElementen, 5);
  check("α_m is kleiner dan bij een portaal", alphaM(g.aantalElementen), Math.sqrt(0.6));
  waar("de kolomlijnen staan van links naar rechts",
    g.kolomlijnen.map((k) => k.voetXmm).join(",") === "0,5000,10000,15000,20000");
}

log("\n[9] Een kolom met een tussenknoop blijft één kolom");
{
  const g = leidScheefstandGeometrieAf({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 1500 }, { id: 3, x: 0, z: 3000 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 2, to: 3 }],
    supports: [{ nodeId: 1 }],
  });
  check("m = 1", g.aantalElementen, 1);
  check("h = 3,0 m", g.hoogteM, 3);
}

log("\n[10] h wordt van de VOET gemeten: een deel onder het opleggingsniveau telt niet mee");
{
  const g = leidScheefstandGeometrieAf({
    nodes: [
      { id: 1, x: 0, z: -1000 },   // console onder maaiveld, geen oplegging
      { id: 2, x: 0, z: 0 },       // opleggingsniveau
      { id: 3, x: 0, z: 6000 },
    ],
    beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 2, to: 3 }],
    supports: [{ nodeId: 2 }],
  });
  check("h = 6,0 m (en niet 7,0)", g.hoogteM, 6);
}

log("\n[11] Model zonder verticale staaf: m = 1 als veilige terugval, en dat wordt gemeld");
{
  const g = leidScheefstandGeometrieAf({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2 }],
    supports: [{ nodeId: 1 }, { nodeId: 2 }],
  });
  check("h = 0", g.hoogteM, 0);
  check("m = 1", g.aantalElementen, 1);
  waar("niet afleidbaar", !g.afleidbaar);
  check("m = 1 geeft de grootst mogelijke α_m", alphaM(g.aantalElementen), 1);
}

// ── 4. De harde eis: bestaande projecten veranderen niet ────────────────────
log("\n[12] HARDE EIS — zonder bron komt er exact 1/noemer uit, bit voor bit");
{
  const g = leidScheefstandGeometrieAf(portaal);
  const zonderBron = bepaalScheefstand({ noemer: 200 }, g, ["en1993"]);
  waar("φ is exact 1/200", zonderBron.phi === 1 / 200);
  waar("bron blijft 'vast'", zonderBron.bron === "vast");
  waar("geen norm aangewezen", zonderBron.norm === null);
  waar("de toelichting zegt dat α_h en α_m NIET zijn toegepast",
    zonderBron.regels[0].uitleg.includes("NIET"));

  const expliciet = bepaalScheefstand({ bron: "vast", noemer: 250 }, g, ["en1993"]);
  waar("een andere noemer werkt gewoon door", expliciet.phi === 1 / 250);

  // Een norm zou hier wél een ander getal geven — dat is precies wat NIET
  // stilzwijgend mag gebeuren.
  const metNorm = bepaalScheefstand({ bron: "en1993", noemer: 200 }, g, ["en1993"]);
  waar("de normstand geeft écht een ander getal", metNorm.phi !== 1 / 200);
  waar("en dat getal is kleiner", metNorm.phi < 1 / 200);
  check("h = 4 m → α_h = 1, m = 2 → φ = 1/200·√0,75", metNorm.phi, 0.005 * Math.sqrt(0.75));

  waar("'vast' staat in de lijst geldige bronnen", SCHEEFSTAND_BRONNEN.includes("vast"));
  waar("een onbekende bron staat er niet in", !SCHEEFSTAND_BRONNEN.includes("en1999"));
}

log("\n[13] Handmatige h en m winnen van de afleiding");
{
  const g = leidScheefstandGeometrieAf(portaal);          // h = 4, m = 2
  const overschreven = bepaalScheefstand(
    { bron: "en1993", noemer: 200, hoogteM: 9, aantalElementen: 1 }, g, ["en1993"]);
  check("h = 9 m handmatig", overschreven.hoogteM, 9);
  check("m = 1 handmatig", overschreven.aantalElementen, 1);
  check("φ = 1/200 · 2/3 · 1", overschreven.phi, 0.005 * (2 / 3));
  waar("beide worden als handmatig gemeld",
    overschreven.hoogteHandmatig && overschreven.aantalHandmatig);

  // m verlagen is de veilige richting en moet dus altijd mogen.
  const kleinereM = bepaalScheefstand(
    { bron: "en1993", noemer: 200, aantalElementen: 1 }, g, ["en1993"]);
  const afgeleid = bepaalScheefstand({ bron: "en1993", noemer: 200 }, g, ["en1993"]);
  waar("kleinere m geeft grotere φ", kleinereM.phi > afgeleid.phi);
}

log("\n[14] 'Ongunstigste' neemt de grootste φ van de toepasselijke normen");
{
  const g = leidScheefstandGeometrieAf(portaal);          // h = 4 m, m = 2
  // Bij h = 4 m: EN 1993 → 1/200·1·√0,75; EN 1995 → 0,005 (h ≤ 5, geen α_m).
  // Hout wint dus.
  const gemengd = bepaalScheefstand(
    { bron: "ongunstigste", noemer: 200 }, g, ["en1993", "en1995"]);
  check("φ = de houtwaarde 0,005", gemengd.phi, 0.005);
  waar("de gekozen norm is EN 1995", gemengd.norm === "en1995");
  waar("beide normen staan in de vergelijking", gemengd.vergelijking.length === 2);
  waar("de vergelijking staat in de waarschuwingen",
    gemengd.waarschuwingen.some((w) => w.includes("Ongunstigste van")));

  const alleenBeton = bepaalScheefstand(
    { bron: "ongunstigste", noemer: 200 }, g, ["en1992"]);
  waar("met alleen beton wint EN 1992", alleenBeton.norm === "en1992");

  // Geen enkele norm van toepassing (alles vrij materiaal): terugval op de
  // vaste noemer, niet op een verzonnen norm.
  const geenNorm = bepaalScheefstand({ bron: "ongunstigste", noemer: 200 }, g, []);
  waar("terugval op de vaste noemer", geenNorm.bron === "vast" && geenNorm.phi === 1 / 200);
  waar("en dat wordt gemeld",
    geenNorm.waarschuwingen.some((w) => w.includes("Geen van de drie normen")));
}

log("\n[15] Een norm kiezen die niet bij het model past levert een melding, geen stilte");
{
  const g = leidScheefstandGeometrieAf(portaal);
  const u = bepaalScheefstand({ bron: "en1995", noemer: 200 }, g, ["en1993"]);
  waar("de keuze wordt gerespecteerd", u.norm === "en1995");
  waar("maar er komt een melding bij",
    u.waarschuwingen.some((w) => w.includes("geen materiaal dat onder die norm valt")));
}

log("\n[16] Welke normen dit model aandraagt, volgt uit de materialen van de staven");
{
  const staal = toepasselijkeScheefstandNormen([
    { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" },
  ]);
  const hout = toepasselijkeScheefstandNormen([
    { id: 1, from: 1, to: 2, material: "C24", profile: "100x200" },
  ]);
  const gemengd = toepasselijkeScheefstandNormen([
    { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" },
    { id: 2, from: 2, to: 3, material: "C24", profile: "100x200" },
  ]);
  waar("staal → EN 1993", staal.join(",") === "en1993");
  waar("hout → EN 1995", hout.join(",") === "en1995");
  waar("gemengd → allebei", gemengd.includes("en1993") && gemengd.includes("en1995"));
  waar("leeg model → geen norm", toepasselijkeScheefstandNormen([]).length === 0);
}

log("\n[17] De toelichting toont de hele afleiding, met artikelen erbij");
{
  const g = leidScheefstandGeometrieAf(portaal);
  const u = bepaalScheefstand({ bron: "en1993", noemer: 200 }, g, ["en1993"]);
  const tekst = scheefstandToelichting(u, g);
  waar("noemt (5.5)", tekst.includes("EN 1993-1-1 (5.5)"));
  waar("toont α_h", tekst.includes("α_h"));
  waar("toont α_m", tekst.includes("α_m"));
  waar("toont φ₀", tekst.includes("φ₀"));
  waar("toont de afleiding van h", tekst.includes("laagste oplegging"));
  waar("toont de afleiding van m", tekst.includes("kolomlijn"));
}

// ── 5. Aansluiting op de motor ──────────────────────────────────────────────
log("\n[18] De afgeleide φ komt werkelijk als H = φ·V bij de motor aan");
{
  const g = leidScheefstandGeometrieAf(portaal);
  const u = bepaalScheefstand({ bron: "en1993", noemer: 200 }, g, ["en1993"]);
  const P = 100000;   // N per kolomtop
  const r = solveAllCases({
    nodes: portaal.nodes,
    beams: portaal.beams.map((b) => ({ ...b, E: 210000, A: 3877, I: 1.673e7 })),
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 4, type: "zRoller" }],
    cases: [{ id: 1, name: "G" }],
    loads: [],
    pointLoads: [
      { nodeId: 2, fz: -P, caseId: 1 },
      { nodeId: 3, fz: -P, caseId: 1 },
    ],
    // Exact dezelfde weg als App.tsx: φ via de NOEMER van de uitkomst.
    scheefstand: { phi: 1 / u.noemer, richting: 1 },
  }).perCase.get(1);
  const H = (1 / u.noemer) * 2 * P;
  check("Σ horizontale reactie = −H (N)",
    r.reactions.get(1).fx + r.reactions.get(4).fx, -H, 0.5);
  check("verticaal ongewijzigd: ΣFz = 200 kN",
    (r.reactions.get(1).fz + r.reactions.get(4).fz) / 1e3, 200, 0.5);
  waar("H is kleiner dan met de kale basiswaarde 1/200", H < 0.005 * 2 * P);
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
