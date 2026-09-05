// Unit-checks voor het verplaatsen, roteren en spiegelen in de profieleditor
// (src/lib/profieleditor/transformeren.ts).
//
// Regels onder test:
//   - een vaste hoek blijft exact: 90° levert 90, niet 89,999, en de
//     coördinaten van een kwartslag komen zonder drijvendekommastaart terug
//   - één bouwsteen draait om zijn eigen hart: de positie blijft staan en
//     alleen α verandert
//   - het hele ontwerp draait om het opgegeven punt: y' = y_c + (y−y_c)·cos φ
//     − (z−z_c)·sin φ, z' = z_c + (y−y_c)·sin φ + (z−z_c)·cos φ, α' = α + φ
//   - vier kwartslagen brengen het ontwerp exact terug in de oude stand
//   - spiegelen om de verticale lijn door een punt: lamel α' = 180° − α,
//     catalogusdeel α' = −α met `gespiegeld` omgeklapt, en twee keer
//     spiegelen is de identiteit
//   - een deel dat niet het doel is blijft ongemoeid
// Uitvoeren: npx tsx test-profieleditor-transform.mjs

const {
  cosSinGraden,
  normaliseerHoek,
  hartVan,
  naamVanBouwsteen,
  aantalBouwstenen,
  verplaats,
  roteer,
  spiegel,
} = await import("./src/lib/profieleditor/transformeren.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

/** Exact gelijk (geen tolerantie) — daar gaat de helft van deze tests over. */
function exact(a, b) { return Object.is(a, b) || a === b; }
function bijna(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }

const HEA200 = { naam: "HEA 200", soort: "ISection", h: 190, b: 200, tw: 6.5, tf: 10, r: 18 };

/** L-profiel uit de startvormen: twee lamellen, zwaartepunt (28,684; 28,684). */
function maakL() {
  return {
    soort: "samenstelling",
    celMeenemen: true,
    lamellen: [
      { id: "l1", b_mm: 100, t_mm: 10, y_mm: 5, z_mm: 50, alphaGraden: 90 },
      { id: "l2", b_mm: 90, t_mm: 10, y_mm: 55, z_mm: 5, alphaGraden: 0 },
    ],
    catalogusdelen: [],
  };
}

function maakGemengd() {
  return {
    soort: "samenstelling",
    celMeenemen: false,
    lamellen: [{ id: "l1", b_mm: 200, t_mm: 20, y_mm: 0, z_mm: 190, alphaGraden: 0 }],
    catalogusdelen: [
      { id: "d1", profiel: HEA200, y_mm: 40, z_mm: 0, alphaGraden: 30, gespiegeld: false },
    ],
  };
}

log("\n── cos/sin en hoeknormalisatie ──────────────────────────────────────");
{
  check("cos/sin 0° exact", exact(cosSinGraden(0)[0], 1) && exact(cosSinGraden(0)[1], 0));
  check("cos/sin 90° exact (cos = 0, niet 6,1·10⁻¹⁷)",
    exact(cosSinGraden(90)[0], 0) && exact(cosSinGraden(90)[1], 1),
    `kreeg ${cosSinGraden(90)}`);
  check("cos/sin 180° exact", exact(cosSinGraden(180)[0], -1) && exact(cosSinGraden(180)[1], 0));
  check("cos/sin 270° exact", exact(cosSinGraden(270)[0], 0) && exact(cosSinGraden(270)[1], -1));
  check("cos/sin −90° exact (via 270°)",
    exact(cosSinGraden(-90)[0], 0) && exact(cosSinGraden(-90)[1], -1));
  check("cos/sin 30° gewoon berekend", bijna(cosSinGraden(30)[0], Math.cos(Math.PI / 6)));

  check("normaliseer 450° → 90", exact(normaliseerHoek(450), 90));
  check("normaliseer 270° → −90", exact(normaliseerHoek(270), -90));
  check("normaliseer 180° blijft 180", exact(normaliseerHoek(180), 180));
  check("normaliseer −180° → 180", exact(normaliseerHoek(-180), 180));
  check("normaliseer −190° → 170", exact(normaliseerHoek(-190), 170));
  check("normaliseer 0 blijft 0 (geen −0)", Object.is(normaliseerHoek(0), 0));
}

log("\n── hulpjes ─────────────────────────────────────────────────────────");
{
  const o = maakGemengd();
  check("hartVan lamel", hartVan(o, "l1").y === 0 && hartVan(o, "l1").z === 190);
  check("hartVan deel", hartVan(o, "d1").y === 40 && hartVan(o, "d1").z === 0);
  check("hartVan onbekend id → null", hartVan(o, "xx") === null);
  check("naam lamel", naamVanBouwsteen(o, "l1") === "Lamel 1");
  check("naam deel met profiel", naamVanBouwsteen(o, "d1") === "Deel 1 (HEA 200)");
  check("aantal bouwstenen", aantalBouwstenen(o) === 2);
}

log("\n── verplaatsen ─────────────────────────────────────────────────────");
{
  const o = maakGemengd();
  const alles = verplaats(o, null, 40, -20);
  check("hele ontwerp: lamel mee", alles.lamellen[0].y_mm === 40 && alles.lamellen[0].z_mm === 170);
  check("hele ontwerp: deel mee", alles.catalogusdelen[0].y_mm === 80 && alles.catalogusdelen[0].z_mm === -20);
  check("hele ontwerp: hoeken ongemoeid",
    alles.lamellen[0].alphaGraden === 0 && alles.catalogusdelen[0].alphaGraden === 30);

  const een = verplaats(o, "l1", 40, -20);
  check("één bouwsteen: alleen die verschuift",
    een.lamellen[0].y_mm === 40 && een.lamellen[0].z_mm === 170);
  check("één bouwsteen: de rest staat stil",
    een.catalogusdelen[0].y_mm === 40 && een.catalogusdelen[0].z_mm === 0);
  check("origineel niet gemuteerd", o.lamellen[0].y_mm === 0 && o.lamellen[0].z_mm === 190);

  const nul = verplaats(o, null, 0, 0);
  check("nulverplaatsing verandert niets",
    JSON.stringify(nul) === JSON.stringify(o));
}

log("\n── roteren: één bouwsteen om zijn eigen hart ───────────────────────");
{
  const o = maakGemengd();
  const hart = hartVan(o, "l1");
  const r = roteer(o, "l1", 90, hart);
  check("positie blijft exact staan", exact(r.lamellen[0].y_mm, 0) && exact(r.lamellen[0].z_mm, 190));
  check("α exact 90 (niet 89,999)", exact(r.lamellen[0].alphaGraden, 90),
    `kreeg ${r.lamellen[0].alphaGraden}`);
  check("andere bouwsteen ongemoeid",
    r.catalogusdelen[0].alphaGraden === 30 && r.catalogusdelen[0].y_mm === 40);

  const d = roteer(o, "d1", 90, hartVan(o, "d1"));
  check("catalogusdeel: positie blijft staan", exact(d.catalogusdelen[0].y_mm, 40) && exact(d.catalogusdelen[0].z_mm, 0));
  check("catalogusdeel: α = 30 + 90 = 120 exact", exact(d.catalogusdelen[0].alphaGraden, 120));
  check("catalogusdeel: gespiegeld ongemoeid", d.catalogusdelen[0].gespiegeld === false);
}

log("\n── roteren: het hele ontwerp om een punt ───────────────────────────");
{
  // Zwaartepunt van het L-profiel: (1000·5 + 900·55)/1900 = 54500/1900.
  const yc = 54500 / 1900;
  const zc = 54500 / 1900;
  const o = maakL();
  const r = roteer(o, null, 90, { y: yc, z: zc });

  // Handmatig: y' = yc − (z − zc), z' = zc + (y − yc) bij φ = 90°.
  const verwacht = (y, z) => [
    Math.round((yc - (z - zc)) * 1e4) / 1e4,
    Math.round((zc + (y - yc)) * 1e4) / 1e4,
  ];
  const [y1, z1] = verwacht(5, 50);
  const [y2, z2] = verwacht(55, 5);
  check("lamel 1 op de gedraaide plek", exact(r.lamellen[0].y_mm, y1) && exact(r.lamellen[0].z_mm, z1),
    `kreeg (${r.lamellen[0].y_mm}, ${r.lamellen[0].z_mm}), verwacht (${y1}, ${z1})`);
  check("lamel 2 op de gedraaide plek", exact(r.lamellen[1].y_mm, y2) && exact(r.lamellen[1].z_mm, z2));
  check("lamel 1: z landt exact op 5 (geen staart)", exact(r.lamellen[0].z_mm, 5),
    `kreeg ${r.lamellen[0].z_mm}`);
  check("lamel 2: z landt exact op 55", exact(r.lamellen[1].z_mm, 55));
  check("α' = α + φ, exact", exact(r.lamellen[0].alphaGraden, 180) && exact(r.lamellen[1].alphaGraden, 90));

  // Zwaartepunt van het gedraaide ontwerp is hetzelfde punt gebleven.
  const a1 = 100 * 10, a2 = 90 * 10;
  const ycNa = (a1 * r.lamellen[0].y_mm + a2 * r.lamellen[1].y_mm) / (a1 + a2);
  const zcNa = (a1 * r.lamellen[0].z_mm + a2 * r.lamellen[1].z_mm) / (a1 + a2);
  check("zwaartepunt blijft op het draaipunt liggen", bijna(ycNa, yc, 1e-4) && bijna(zcNa, zc, 1e-4),
    `kreeg (${ycNa}, ${zcNa})`);

  // Vier kwartslagen = identiteit.
  let vier = o;
  for (let i = 0; i < 4; i++) vier = roteer(vier, null, 90, { y: yc, z: zc });
  check("vier kwartslagen brengen alles exact terug",
    JSON.stringify(vier.lamellen) === JSON.stringify(o.lamellen),
    JSON.stringify(vier.lamellen));

  // Een willekeurige hoek volgt de formule.
  const phi = 37;
  const c = Math.cos((phi * Math.PI) / 180);
  const s = Math.sin((phi * Math.PI) / 180);
  const w = roteer(o, null, phi, { y: 0, z: 0 });
  check("hoek 37°: y' = y·cos − z·sin", bijna(w.lamellen[0].y_mm, 5 * c - 50 * s, 1e-4));
  check("hoek 37°: z' = y·sin + z·cos", bijna(w.lamellen[0].z_mm, 5 * s + 50 * c, 1e-4));
  check("hoek 37°: α' = 90 + 37 = 127", exact(w.lamellen[0].alphaGraden, 127));
}

log("\n── spiegelen ───────────────────────────────────────────────────────");
{
  const o = maakGemengd();
  const om = { y: 100, z: 0 };
  const sp = spiegel(o, null, om);
  check("lamel spiegelt om de verticale lijn", exact(sp.lamellen[0].y_mm, 200));
  check("lamel: z blijft", exact(sp.lamellen[0].z_mm, 190));
  check("lamel: α' = 180 − α", exact(sp.lamellen[0].alphaGraden, 180));
  check("deel spiegelt mee", exact(sp.catalogusdelen[0].y_mm, 160));
  check("deel: α' = −α", exact(sp.catalogusdelen[0].alphaGraden, -30));
  check("deel: gespiegeld omgeklapt", sp.catalogusdelen[0].gespiegeld === true);

  const twee = spiegel(sp, null, om);
  check("twee keer spiegelen is de identiteit",
    JSON.stringify(twee) === JSON.stringify(o), JSON.stringify(twee.catalogusdelen));

  // Eén bouwsteen om zijn eigen hart: de positie blijft staan.
  const een = spiegel(o, "d1", hartVan(o, "d1"));
  check("één deel om eigen hart: y blijft", exact(een.catalogusdelen[0].y_mm, 40));
  check("één deel om eigen hart: α' = −30 en gespiegeld aan",
    exact(een.catalogusdelen[0].alphaGraden, -30) && een.catalogusdelen[0].gespiegeld === true);
  check("één deel: de lamel blijft ongemoeid",
    een.lamellen[0].y_mm === 0 && een.lamellen[0].alphaGraden === 0);
}

log(`\n${failed === 0 ? "ALLE TESTS GESLAAGD" : "TESTS GEFAALD"} — ${passed} ok, ${failed} fout\n`);
process.exit(failed === 0 ? 0 : 1);
