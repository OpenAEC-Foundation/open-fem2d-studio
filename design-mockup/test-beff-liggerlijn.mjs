// De liggerlijn voor de meewerkende flensbreedte (NEN-EN 1992-1-1 5.3.2.1).
//
// Onder test staat `lib/beffLiggerlijn.ts`: de brug tussen de modeltopologie
// (knopen, staven, opleggingen) en de invoer die de rekenkern wil — de rij
// overspanningen met de twee uiteinden, precies wat figuur 5.2 tekent.
//
// HIER WORDT GEEN b_eff GEREKEND. De norm zelf staat in de crate-lib
// (src-tauri/crates/nen-en-1992-1-1/src/beff.rs) en is met de hand nagerekend
// in nen-en-1992-1-1/tests/meewerkende_flensbreedte.rs. Een tweede
// implementatie van (5.7) in TypeScript zou betekenen dat dezelfde doorsnede
// twee plausibele breedtes kan krijgen.
//
// Wat deze test wél bewaakt:
//   - een doorgaande ligger over drie steunpunten wordt één lijn met twee
//     overspanningen, óók als hij in vier staven is opgeknipt;
//   - een maasknoop (alleen doorgeknipt) is GEEN steunpunt;
//   - in een portaal is de kolom het steunpunt, ook zonder oplegging daar;
//   - de drie uiteinden: vrij opgelegd, momentvast en vrij (uitkraging);
//   - een scharnier in de staaf maakt een ingeklemd uiteinde momentvrij;
//   - een onduidelijke topologie levert een REDEN en geen lijn.
//
// Uitvoeren: npx tsx test-beff-liggerlijn.mjs

const { bepaalLiggerlijn, lijnPositieMm, staafRichting, beffPerStaafsegment } =
  await import("./src/lib/beffLiggerlijn.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}
function gelijk(naam, gemeten, verwacht) {
  const a = JSON.stringify(gemeten), b = JSON.stringify(verwacht);
  check(naam, a === b, `${a} ≠ ${b}`);
}

/** Staaf met de standaard betondoorsnede. */
function staaf(id, from, to, extra = {}) {
  return { id, from, to, material: "C30/37", profile: "300x500", ...extra };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Doorgaande ligger over drie steunpunten, opgeknipt in vier staven
// ─────────────────────────────────────────────────────────────────────────
//
//   knopen:   1 ── 2 ── 3 ── 4 ── 5      op x = 0, 3000, 6000, 8500, 11000
//   staven:    101  102  103  104
//   opleggingen: knoop 1 (pinned), knoop 3 (zRoller), knoop 5 (pinned)
//
//   Knopen 2 en 4 zijn maasknopen: dezelfde richting, hetzelfde profiel, geen
//   oplegging, niets anders aangesloten. Zij horen GEEN overspanning te
//   beëindigen.
//
//   Verwacht: twee overspanningen van 6000 en 5000 mm, beide uiteinden vrij
//   opgelegd.
log("\n[1] doorgaande ligger over drie steunpunten, in vier staven geknipt");
{
  const nodes = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 0 }, { id: 3, x: 6000, z: 0 },
    { id: 4, x: 8500, z: 0 }, { id: 5, x: 11000, z: 0 },
  ];
  const beams = [staaf(101, 1, 2), staaf(102, 2, 3), staaf(103, 3, 4), staaf(104, 4, 5)];
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: 3, type: "zRoller" },
    { nodeId: 5, type: "pinned" },
  ];

  const r = bepaalLiggerlijn(102, { nodes, beams, supports });
  check("de lijn is bepaald", r.ok, r.ok ? "" : r.reden);
  if (r.ok) {
    gelijk("alle vier de staven zitten in de lijn",
      r.lijn.staven.map((s) => s.beamId), [101, 102, 103, 104]);
    gelijk("twee overspanningen", r.lijn.line.spans_mm, [6000, 5000]);
    gelijk("steunpunten", r.lijn.steunpuntKnopen, [1, 3, 5]);
    check("begin vrij opgelegd", r.lijn.line.start === "Support", r.lijn.line.start);
    check("eind vrij opgelegd", r.lijn.line.end === "Support", r.lijn.line.end);
    check("maasknoop 2 telt niet als steunpunt", !r.lijn.steunpuntKnopen.includes(2));
    check("maasknoop 4 telt niet als steunpunt", !r.lijn.steunpuntKnopen.includes(4));
    check("totale lengte", r.lijn.totaleLengteMm === 11000, String(r.lijn.totaleLengteMm));
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Alleen naar de opleggingen kijken zou het portaal missen
// ─────────────────────────────────────────────────────────────────────────
//
//        201        202
//   2 ───────── 3 ───────── 4        ligger op z = 3000
//   |           |           |
//  301         302         303       kolommen
//   |           |           |
//   1           5           6        opleggingen alleen hier, onderaan
//
//   Op knoop 3 staat GEEN oplegging, maar er sluit een kolom aan. Dat is het
//   tussensteunpunt; zonder die regel zou de hele ligger één overspanning van
//   12000 mm zijn — één veldgebied, geen steunpuntgebied, dus overal de
//   grootste b_eff. Precies de onveilige kant.
log("\n[2] portaal: de kolom is het steunpunt, ook zonder oplegging daar");
{
  const nodes = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 },
    { id: 3, x: 6000, z: 3000 }, { id: 5, x: 6000, z: 0 },
    { id: 4, x: 12000, z: 3000 }, { id: 6, x: 12000, z: 0 },
  ];
  const beams = [
    staaf(201, 2, 3), staaf(202, 3, 4),
    { id: 301, from: 1, to: 2, material: "C30/37", profile: "300x300" },
    { id: 302, from: 5, to: 3, material: "C30/37", profile: "300x300" },
    { id: 303, from: 6, to: 4, material: "C30/37", profile: "300x300" },
  ];
  const supports = [
    { nodeId: 1, type: "fixed" },
    { nodeId: 5, type: "fixed" },
    { nodeId: 6, type: "fixed" },
  ];

  const r = bepaalLiggerlijn(201, { nodes, beams, supports });
  check("de lijn is bepaald", r.ok, r.ok ? "" : r.reden);
  if (r.ok) {
    gelijk("alleen de liggerstaven", r.lijn.staven.map((s) => s.beamId), [201, 202]);
    gelijk("twee overspanningen", r.lijn.line.spans_mm, [6000, 6000]);
    check("knoop 3 is steunpunt", r.lijn.steunpuntKnopen.includes(3));
    check("begin momentvast", r.lijn.line.start === "Restrained", r.lijn.line.start);
    check("eind momentvast", r.lijn.line.end === "Restrained", r.lijn.line.end);
    check("de kolom-als-steunpunt is gemeld",
      r.lijn.meldingen.some((m) => m.includes("kolom")),
      JSON.stringify(r.lijn.meldingen));
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3. De uitkraging (figuur 5.2 helemaal)
// ─────────────────────────────────────────────────────────────────────────
//
//   knopen 1..4 op x = 0, 6000, 11000, 13000
//   opleggingen op 1 (pinned), 2 (zRoller), 3 (zRoller); knoop 4 is vrij.
//
//   Verwacht: l1 = 6000, l2 = 5000, l3 = 2000; begin "Support", eind "Free" —
//   letterlijk de ligger van figuur 5.2.
log("\n[3] uitkraging: het vrije einde levert een 'Free'-uiteinde");
{
  const nodes = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 },
    { id: 3, x: 11000, z: 0 }, { id: 4, x: 13000, z: 0 },
  ];
  const beams = [staaf(1, 1, 2), staaf(2, 2, 3), staaf(3, 3, 4)];
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: 2, type: "zRoller" },
    { nodeId: 3, type: "zRoller" },
  ];

  const r = bepaalLiggerlijn(1, { nodes, beams, supports });
  check("de lijn is bepaald", r.ok, r.ok ? "" : r.reden);
  if (r.ok) {
    gelijk("de ligger van figuur 5.2", r.lijn.line.spans_mm, [6000, 5000, 2000]);
    check("begin vrij opgelegd", r.lijn.line.start === "Support", r.lijn.line.start);
    check("eind vrij", r.lijn.line.end === "Free", r.lijn.line.end);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Een oplegging die alleen de LANGSrichting vasthoudt is geen steunpunt
// ─────────────────────────────────────────────────────────────────────────
//
//   Horizontale ligger met een xRoller op het rechteruiteinde: die houdt x
//   vast, dus de richting LANGS de staaf. Dwars (z) is de ligger daar vrij, en
//   dan is het geen steunpunt uit figuur 5.2 maar een vrij einde.
log("\n[4] een oplegging langs de staafas houdt de ligger niet dwars vast");
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }, { id: 3, x: 7000, z: 0 }];
  const beams = [staaf(1, 1, 2), staaf(2, 2, 3)];
  const supports = [
    { nodeId: 1, type: "fixed" },
    { nodeId: 2, type: "zRoller" },
    { nodeId: 3, type: "xRoller" },
  ];

  const r = bepaalLiggerlijn(2, { nodes, beams, supports });
  check("de lijn is bepaald", r.ok, r.ok ? "" : r.reden);
  if (r.ok) {
    check("eind is vrij, niet opgelegd", r.lijn.line.end === "Free", r.lijn.line.end);
    check("begin is momentvast (ingeklemd)", r.lijn.line.start === "Restrained",
      r.lijn.line.start);
    gelijk("één overspanning plus een uitkraging", r.lijn.line.spans_mm, [5000, 2000]);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Een scharnier in de staaf maakt een ingeklemd uiteinde momentvrij
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] scharnier aan het staafeinde: 'Restrained' wordt 'Support'");
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }];
  const supports = [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "pinned" }];

  const star = bepaalLiggerlijn(1, {
    nodes, supports, beams: [staaf(1, 1, 2)],
  });
  check("zonder scharnier is het begin momentvast",
    star.ok && star.lijn.line.start === "Restrained",
    star.ok ? star.lijn.line.start : star.reden);

  const scharnierend = bepaalLiggerlijn(1, {
    nodes, supports, beams: [staaf(1, 1, 2, { releases: { startRy: true } })],
  });
  check("met scharnier is het begin vrij opgelegd",
    scharnierend.ok && scharnierend.lijn.line.start === "Support",
    scharnierend.ok ? scharnierend.lijn.line.start : scharnierend.reden);
}

// ─────────────────────────────────────────────────────────────────────────
// 6. De keten stopt bij een andere doorsnede, en bij een knik
// ─────────────────────────────────────────────────────────────────────────
log("\n[6] de keten stopt bij een andere doorsnede en bij een knik");
{
  const nodes = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 },
    { id: 3, x: 8000, z: 0 }, { id: 4, x: 12000, z: 2000 },
  ];
  const beams = [
    staaf(1, 1, 2),
    { id: 2, from: 2, to: 3, material: "C30/37", profile: "300x700" }, // andere hoogte
    staaf(3, 3, 4), // knik omhoog
  ];
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: 3, type: "pinned" },
    { nodeId: 4, type: "pinned" },
  ];

  const r = bepaalLiggerlijn(1, { nodes, beams, supports });
  check("de lijn is bepaald", r.ok, r.ok ? "" : r.reden);
  if (r.ok) {
    gelijk("alleen staaf 1", r.lijn.staven.map((s) => s.beamId), [1]);
    gelijk("één overspanning", r.lijn.line.spans_mm, [4000]);
    check("het eind is momentvast — daar sluit staaf 2 aan",
      r.lijn.line.end === "Restrained", r.lijn.line.end);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 7. Weigeren met een reden
// ─────────────────────────────────────────────────────────────────────────
log("\n[7] onduidelijke topologie levert een reden en geen lijn");
{
  // (a) Losse staaf zonder enige oplegging of aansluiting.
  const los = bepaalLiggerlijn(1, {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }],
    beams: [staaf(1, 1, 2)],
    supports: [],
  });
  check("losse staaf wordt geweigerd", !los.ok);
  check("de reden noemt het ontbrekende steunpunt",
    !los.ok && los.reden.includes("steunpunt"), los.ok ? "" : los.reden);

  // (b) Twee staven in het verlengde met dezelfde doorsnede op dezelfde knoop:
  //     welke de ligger voortzet is niet te bepalen.
  const dubbel = bepaalLiggerlijn(1, {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 },
      { id: 3, x: 9000, z: 0 }, { id: 4, x: 9000, z: 0 },
    ],
    beams: [staaf(1, 1, 2), staaf(2, 2, 3), staaf(3, 2, 4)],
    supports: [{ nodeId: 1, type: "pinned" }],
  });
  check("dubbele voortzetting wordt geweigerd", !dubbel.ok);
  check("de reden noemt de knoop en de staven",
    !dubbel.ok && dubbel.reden.includes("verlengde"), dubbel.ok ? "" : dubbel.reden);

  // (c) Een staaf die niet in het model zit.
  const weg = bepaalLiggerlijn(99, {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }],
    beams: [staaf(1, 1, 2)],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
  });
  check("onbekende staaf wordt geweigerd", !weg.ok);

  // (d) Een gesloten lus van collineaire staven bestaat niet, maar een staaf
  //     met lengte 0 wel — die moet ook een reden geven.
  const nul = bepaalLiggerlijn(1, {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 0 }],
    beams: [staaf(1, 1, 2)],
    supports: [{ nodeId: 1, type: "pinned" }],
  });
  check("staaf zonder lengte wordt geweigerd", !nul.ok);
}

// ─────────────────────────────────────────────────────────────────────────
// 8. Van staafstation naar lijnpositie — ook als de staaf tegendraads ligt
// ─────────────────────────────────────────────────────────────────────────
//
// Elk staafsegment krijgt de b_eff van het gebied waarin zijn MIDDEN valt.
// Daarvoor moet de lokale x van een staaf naar een lijnpositie kunnen. Staaf
// 2 is hieronder van 3 naar 2 getekend en loopt dus tegen de lijnrichting in.
log("\n[8] staafstation → lijnpositie, ook bij een tegendraads getekende staaf");
{
  const nodes = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }, { id: 3, x: 10000, z: 0 },
  ];
  const beams = [staaf(1, 1, 2), staaf(2, 3, 2)];
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: 2, type: "zRoller" },
    { nodeId: 3, type: "pinned" },
  ];
  const r = bepaalLiggerlijn(1, { nodes, beams, supports });
  check("de lijn is bepaald", r.ok, r.ok ? "" : r.reden);
  if (r.ok) {
    gelijk("twee overspanningen", r.lijn.line.spans_mm, [4000, 6000]);
    const s2 = r.lijn.staven.find((s) => s.beamId === 2);
    check("staaf 2 loopt tegendraads", s2 && s2.meeMetDeLijn === false);
    // Lokale x = 0 van staaf 2 ligt bij knoop 3, dus op 10000 mm langs de lijn.
    check("lokale 0 van staaf 2 → 10000 mm",
      lijnPositieMm(r.lijn, 2, 0) === 10000, String(lijnPositieMm(r.lijn, 2, 0)));
    check("lokale 6000 van staaf 2 → 4000 mm",
      lijnPositieMm(r.lijn, 2, 6000) === 4000, String(lijnPositieMm(r.lijn, 2, 6000)));
    check("lokale 1000 van staaf 1 → 1000 mm",
      lijnPositieMm(r.lijn, 1, 1000) === 1000, String(lijnPositieMm(r.lijn, 1, 1000)));
    check("onbekende staaf levert null", lijnPositieMm(r.lijn, 99, 0) === null);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 9. Een kolom: dwars is dan de x-richting
// ─────────────────────────────────────────────────────────────────────────
log("\n[9] verticale staaf: 'dwars' is de x-richting");
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 4000 }];
  const beams = [staaf(1, 1, 2)];
  // zRoller houdt z vast — dat is LANGS de kolom, dus geen dwarssteunpunt.
  const alleenLangs = bepaalLiggerlijn(1, {
    nodes, beams, supports: [{ nodeId: 1, type: "zRoller" }, { nodeId: 2, type: "zRoller" }],
  });
  check("alleen langsrichting vastgehouden → geweigerd", !alleenLangs.ok);

  const dwars = bepaalLiggerlijn(1, {
    nodes, beams, supports: [{ nodeId: 1, type: "xRoller" }, { nodeId: 2, type: "xRoller" }],
  });
  check("xRoller houdt de kolom dwars vast", dwars.ok, dwars.ok ? "" : dwars.reden);
  if (dwars.ok) {
    gelijk("één overspanning van 4000", dwars.lijn.line.spans_mm, [4000]);
    check("beide uiteinden vrij opgelegd",
      dwars.lijn.line.start === "Support" && dwars.lijn.line.end === "Support");
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[10] staafRichting");
{
  const nodes = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 4000 }];
  const d = staafRichting({ id: 1, from: 1, to: 2 }, nodes);
  check("eenheidsrichting", Math.abs(d.x - 0.6) < 1e-12 && Math.abs(d.z - 0.8) < 1e-12);
  check("ontbrekende knoop → null",
    staafRichting({ id: 1, from: 1, to: 9 }, nodes) === null);
}

// ─────────────────────────────────────────────────────────────────────────
// 11. b_eff per staafsegment — de koppeling met de tweede-orde-indeling
// ─────────────────────────────────────────────────────────────────────────
//
// De verdeling hieronder is NIET verzonnen: het zijn de vier gebieden van
// figuur 5.2 voor l1 = 6000, l2 = 5000, l3 = 2000 met b_w = 300 en
// b_1 = b_2 = 1000 mm, zoals de kern ze teruggeeft en zoals ze met de hand
// zijn nagerekend in nen-en-1992-1-1/tests/meewerkende_flensbreedte.rs:
//
//   eindveld        0 …  5100   l0 = 5100   b_eff = 1720
//   tussensteunpunt 5100 … 6750 l0 = 1650   b_eff =  960
//   binnenveld      6750 … 10250 l0 = 3500  b_eff = 1400
//   uitkraging     10250 … 13000 l0 = 2750  b_eff = 1250
log("\n[11] b_eff per staafsegment: elk segment krijgt het gebied van zijn midden");
{
  const nodes = [
    { id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 },
    { id: 3, x: 11000, z: 0 }, { id: 4, x: 13000, z: 0 },
  ];
  const beams = [staaf(1, 1, 2), staaf(2, 2, 3), staaf(3, 3, 4)];
  const supports = [
    { nodeId: 1, type: "pinned" },
    { nodeId: 2, type: "zRoller" },
    { nodeId: 3, type: "zRoller" },
  ];
  const r = bepaalLiggerlijn(1, { nodes, beams, supports });
  check("de lijn is bepaald", r.ok, r.ok ? "" : r.reden);

  const zone = (x0, x1, l0, bEff) => ({
    zone: { x_start_mm: x0, x_end_mm: x1, l0_mm: l0 },
    b_eff_mm: bEff,
  });
  const verdeling = {
    total_length_mm: 13000,
    zones: [
      zone(0, 5100, 5100, 1720),
      zone(5100, 6750, 1650, 960),
      zone(6750, 10250, 3500, 1400),
      zone(10250, 13000, 2750, 1250),
    ],
  };

  if (r.ok) {
    // Staaf 1 loopt van 0 tot 6000 mm langs de lijn. Segmenten van 1000 mm:
    // middens op 500, 1500, 2500, 3500, 4500 en 5500 mm. De eerste vijf liggen
    // in het eindveld (b_eff = 1720), de laatste boven het steunpunt (960).
    const middens = [500, 1500, 2500, 3500, 4500, 5500];
    const uit = beffPerStaafsegment(r.lijn, verdeling, 1, middens, 1000);
    check("er komt per segment een waarde", uit && uit.length === 6);
    gelijk("b_eff per segment", uit.map((s) => s.bEffMm),
      [1720, 1720, 1720, 1720, 1720, 960]);
    gelijk("l0 per segment", uit.map((s) => s.l0Mm),
      [5100, 5100, 5100, 5100, 5100, 1650]);
    // De grens ligt op 5100 mm; die valt binnen de segmenten [4000,5000]?
    // nee — binnen [4000..5000] niet, maar het segment met midden 4500 loopt
    // van 4000 tot 5000 en raakt de grens niet; het segment met midden 5500
    // loopt van 5000 tot 6000 en bevat de grens op 5100 wél.
    gelijk("waar de gebiedsgrens door een segment loopt",
      uit.map((s) => s.grensBinnenSegment),
      [false, false, false, false, false, true]);

    // Staaf 3 is de uitkraging: één gebied, dus nergens een sprong.
    const uitkraging = beffPerStaafsegment(r.lijn, verdeling, 3, [500, 1500], 1000);
    gelijk("de uitkraging ligt geheel in één gebied",
      uitkraging.map((s) => s.bEffMm), [1250, 1250]);
    check("geen grens binnen die segmenten",
      uitkraging.every((s) => !s.grensBinnenSegment));

    check("een staaf buiten de lijn levert null",
      beffPerStaafsegment(r.lijn, verdeling, 99, [500], 1000) === null);
  }
}

log(`\n${failed === 0 ? "✓" : "✗"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
