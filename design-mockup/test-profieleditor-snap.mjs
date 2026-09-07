// Unit-checks voor de objectsnap van de profieleditor
// (src/lib/profieleditor/snappunten.ts) — de punten waar de aanwijzer op
// vastklikt bij het verplaatsen in twee klikken en bij het slepen.
//
// Regels onder test:
//   - een lamel levert zijn vier hoekpunten, de vier middens van zijn zijden
//     en zijn hart; een catalogusdeel dezelfde negen punten van zijn
//     omhullende rechthoek, meegedraaid en meegespiegeld
//   - een profiel met gaten levert de omhullende van het basisprofiel plus het
//     hart van elk gat, op de plek waar dat gat getekend staat
//   - het zwaartepunt uit de motor is een snappunt, en ontbreekt als de motor
//     nog niets heeft teruggegeven
//   - elk punt draagt het id van zijn bouwsteen; daarop filtert het slepen
//     (eigen punten om vast te pakken, alle andere om neer te zetten)
//   - DRIJVENDEKOMMAVAL: een staande lamel (alpha = 90°) krijgt zijn
//     hoekpunten via Math.cos(pi/2) = 6,1e-17 en komt dus rauw op
//     393,99999999999994 uit. Een mikpunt hoort een rond getal te zijn: de
//     snaplaag legt elk punt op hetzelfde 0,0001-rooster als transformeren.ts,
//     zodat doelpunt - basispunt een schone maat oplevert en de bouwsteon
//     precies op het aangewezen punt landt in plaats van 6e-14 ernaast
//   - zoeken gebeurt in SCHERMeenheden: dezelfde afstand in millimeters vangt
//     wel bij ingezoomd beeld en niet bij uitgezoomd beeld
//   - bij bijna gelijke afstand wint een hoekpunt van een midden, en een
//     midden van een hart of het zwaartepunt
//   - twee klikken samen: doelpunt - basispunt, door verplaats() heen, laat
//     een hoekpunt EXACT op het aangewezen hoekpunt landen (verschil 0, niet
//     bij benadering) — ook voor een lamel onder een schuine hoek
// Uitvoeren: npx tsx test-profieleditor-snap.mjs

const { snapPunten, dichtstbijzijndeSnap, VANG_NAAM } = await import(
  "./src/lib/profieleditor/snappunten.ts"
);
const { lamelHoekpunten } = await import("./src/lib/profieleditor/geometrie.ts");
const { verplaats } = await import("./src/lib/profieleditor/transformeren.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

/** Exact gelijk (geen tolerantie) — daar gaat de helft van deze tests over. */
function exact(a, b) { return Object.is(a, b) || a === b; }

const HEA200 = { naam: "HEA 200", soort: "ISection", h: 190, b: 200, tw: 6.5, tf: 10, r: 18 };
const IPE300 = { naam: "IPE 300", soort: "ISection", h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15 };

/** Liggende onderplaat en een staande plaat ernaast. */
function maakTweePlaten() {
  return {
    soort: "samenstelling",
    celMeenemen: false,
    lamellen: [
      { id: "l1", b_mm: 200, t_mm: 20, y_mm: 100, z_mm: 10, alphaGraden: 0 },
      { id: "l2", b_mm: 300, t_mm: 12, y_mm: 400, z_mm: 150, alphaGraden: 90 },
    ],
    catalogusdelen: [],
  };
}

/** Zoekt een punt op coördinaat; `soort` optioneel. */
function op(punten, y, z, soort) {
  return punten.find(
    (p) => exact(p.y, y) && exact(p.z, z) && (soort === undefined || p.soort === soort),
  );
}

/**
 * Schermprojectie zoals het tekenvlak hem maakt: X = ox + y·s, Y = oy − z·s,
 * met s in schermeenheden per millimeter.
 */
function projectie(s, ox = 64, oy = 480) {
  return (y, z) => [ox + y * s, oy - z * s];
}
const STRAAL = 12;

log("\n── snappunten van lamellen ─────────────────────────────────────────");
{
  const o = maakTweePlaten();
  const pt = snapPunten(o, [], { y: 250, z: 80 });

  // Lamel 1: hart (100, 10), b = 200, t = 20 → hoeken (0,0) (200,0) (200,20) (0,20).
  check("l1 hoek linksonder (0, 0)", !!op(pt, 0, 0, "hoek"));
  check("l1 hoek rechtsonder (200, 0)", !!op(pt, 200, 0, "hoek"));
  check("l1 hoek rechtsboven (200, 20)", !!op(pt, 200, 20, "hoek"));
  check("l1 hoek linksboven (0, 20)", !!op(pt, 0, 20, "hoek"));
  check("l1 midden onderzijde (100, 0)", !!op(pt, 100, 0, "midden"));
  check("l1 midden bovenzijde (100, 20)", !!op(pt, 100, 20, "midden"));
  check("l1 midden rechterzijde (200, 10)", !!op(pt, 200, 10, "midden"));
  check("l1 hart (100, 10)", !!op(pt, 100, 10, "hart"));
  check("elk punt draagt het id van zijn lamel",
    pt.filter((p) => p.id === "l1").length === 9,
    `${pt.filter((p) => p.id === "l1").length} punten met id l1`);

  // Lamel 2 staat: alpha 90, b = 300, t = 12, hart (400, 150).
  check("l2 hoek linksonder (394, 0)", !!op(pt, 394, 0, "hoek"));
  check("l2 hoek rechtsboven (406, 300)", !!op(pt, 406, 300, "hoek"));
  check("l2 hart (400, 150)", !!op(pt, 400, 150, "hart"));

  check("zwaartepunt uit de motor doet mee", !!op(pt, 250, 80, "zwaartepunt"));
  check("zwaartepunt heeft geen id", op(pt, 250, 80, "zwaartepunt").id === undefined);
  check("zonder motoruitvoer geen zwaartepunt",
    snapPunten(o, [], null).every((p) => p.soort !== "zwaartepunt"));
  check("twee lamellen geven 2 × 9 punten + zwaartepunt", pt.length === 19, String(pt.length));
}

log("\n── drijvendekommaval: mikpunten op het 0,0001-rooster ──────────────");
{
  /** Op het rooster van de rekenlaag (transformeren.ts) leggen. */
  const rond = (v) => Math.round(v * 1e4) / 1e4;

  // De staande plaat van de startvorm "Hoek L": b = 100, t = 10, hart (5, 50).
  // Zijn hoekpunten horen (0,0) (10,0) (10,100) (0,100) te zijn.
  const staand = { id: "s1", b_mm: 100, t_mm: 10, y_mm: 5, z_mm: 50, alphaGraden: 90 };
  const rauw = lamelHoekpunten(staand);
  const vuil = rauw.flat().filter((v) => !exact(v, rond(v)));
  check("de rauwe meetkunde van een staande lamel draagt drijvendekommastof",
    vuil.length > 0, JSON.stringify(rauw));
  check("het hoekpunt (10, 0) komt rauw uit op 9,999999999999996",
    !exact(rauw[0][0], 10) && Math.abs(rauw[0][0] - 10) < 1e-10,
    `rauw ${rauw[0][0]}`);
  check("en zijn z komt rauw uit op −3,06e−16 in plaats van 0",
    !exact(rauw[0][1], 0) && Math.abs(rauw[0][1]) < 1e-10,
    `rauw ${rauw[0][1]}`);
  // Ook een lamel die er wél rond uitziet heeft de stof in één coördinaat:
  // (394, 0) van de tweede plaat komt uit op (394, 3,67e−16).
  const rauw2 = lamelHoekpunten(maakTweePlaten().lamellen[1]);
  check("ook de tweede plaat: z van het hoekpunt (394, 0) is niet exact 0",
    !exact(rauw2[3][1], 0) && Math.abs(rauw2[3][1]) < 1e-10, `rauw ${rauw2[3][1]}`);

  // Een mikpunt hoort een rond getal te zijn: de snaplaag legt alles op
  // hetzelfde 0,0001-rooster waarop de bewerkingen hun coördinaten neerzetten.
  const staandOntwerp = { soort: "samenstelling", celMeenemen: false, lamellen: [staand], catalogusdelen: [] };
  const staandPt = snapPunten(staandOntwerp, [], null);
  check("het snappunt is wél exact (10, 0)", !!op(staandPt, 10, 0, "hoek"),
    JSON.stringify(staandPt.filter((p) => p.soort === "hoek")));
  check("en (0, 100) ook", !!op(staandPt, 0, 100, "hoek"));

  const o = maakTweePlaten();
  const pt = snapPunten(o, [], { y: 250, z: 80 });
  check("élk snappunt ligt op het 0,0001-rooster",
    pt.every((p) => exact(p.y, rond(p.y)) && exact(p.z, rond(p.z))),
    JSON.stringify(pt.filter((p) => !exact(p.y, rond(p.y)) || !exact(p.z, rond(p.z)))));
  check("geen −0 in de snappunten", pt.every((p) => !Object.is(p.y, -0) && !Object.is(p.z, -0)));

  // Zonder die afronding zou Δz hier 20 + 3,67e−16 zijn: de plaat landt dan
  // naast het hoekpunt dat je aanwees.
  const doel = op(pt, 394, 0, "hoek");
  const basis = op(pt, 200, 20, "hoek");
  check("doelpunt − basispunt geeft een schone maat: Δy = 194",
    exact(doel.y - basis.y, 194), String(doel.y - basis.y));
  check("doelpunt − basispunt geeft een schone maat: Δz = −20",
    exact(doel.z - basis.z, -20), String(doel.z - basis.z));
}

log("\n── zoeken in schermeenheden ────────────────────────────────────────");
{
  const pt = snapPunten(maakTweePlaten(), [], null);
  const s = 1.3;
  const naar = projectie(s);
  const [hx, hy] = naar(200, 20);

  check("vlak naast een hoekpunt vangt dat hoekpunt",
    (() => { const v = dichtstbijzijndeSnap(pt, naar, hx + 4, hy + 4, STRAAL);
      return v && v.soort === "hoek" && exact(v.y, 200) && exact(v.z, 20); })());
  check("ver van elk punt vangt niets (het raster wint dan)",
    dichtstbijzijndeSnap(pt, naar, hx + 40, hy + 40, STRAAL) === null);

  // Dezelfde afstand in millimeters, twee zoomstanden. De straal hoort bij het
  // beeld: uitgezoomd (0,5 eenheid/mm) reikt hij 24 mm ver, ingezoomd
  // (4 eenheden/mm) nog maar 3 mm. Op het scherm blijft de vangst dus even
  // gevoelig, en inzoomen maakt hem in millimeters vanzelf fijner.
  const uit = projectie(0.5);
  const in_ = projectie(4);
  const vangt = (naarScherm, y, z) =>
    dichtstbijzijndeSnap(pt, naarScherm, ...naarScherm(y, z), STRAAL) !== null;

  check("6 mm naast een hoekpunt: uitgezoomd (12 eenh. = 24 mm) wél vangst",
    vangt(uit, 206, 20));
  check("6 mm naast een hoekpunt: ingezoomd (12 eenh. = 3 mm) geen vangst",
    !vangt(in_, 206, 20));
  check("1,5 mm naast een hoekpunt: ingezoomd wél vangst",
    (() => { const v = dichtstbijzijndeSnap(pt, in_, ...in_(201.5, 20), STRAAL);
      return v && exact(v.y, 200) && exact(v.z, 20); })());
  check("30 mm naast een hoekpunt: ook uitgezoomd geen vangst",
    !vangt(uit, 230, 20));
  check("de straal is in schermeenheden, niet in millimeters",
    vangt(uit, 206, 20) && !vangt(in_, 206, 20));
}

log("\n── voorrang bij bijna gelijke afstand ──────────────────────────────");
{
  const pt = snapPunten(maakTweePlaten(), [], { y: 100, z: 10 });
  // Uitgezoomd, zodat de linkerzijde van l1 — hoek (0,0), midden (0,10) en
  // hoek (0,20) — helemaal binnen de straal valt.
  const naar = projectie(0.5);

  // Midden tussen de hoek (0,0) en het midden (0,10): allebei 2,5 eenheden
  // weg, en dan wint het hoekpunt door zijn lagere opslag.
  const v = dichtstbijzijndeSnap(pt, naar, ...naar(0, 5), STRAAL);
  check("bij gelijke afstand wint het hoekpunt van het midden",
    v.soort === "hoek" && exact(v.z, 0), JSON.stringify(v));

  // De opslag is een duwtje, geen veto: staat de aanwijzer écht op het midden,
  // dan wint het midden van het hoekpunt vijf eenheden verderop.
  const w = dichtstbijzijndeSnap(pt, naar, ...naar(0, 10), STRAAL);
  check("een duidelijk dichterbij midden wint wél van een hoekpunt",
    w.soort === "midden" && exact(w.z, 10), JSON.stringify(w));

  // Hetzelfde tussen een midden en een hart: het midden (100, 20) ligt op de
  // bovenzijde, het hart (100, 10) tien millimeter lager.
  const x = dichtstbijzijndeSnap(pt, naar, ...naar(100, 15), STRAAL);
  check("bij gelijke afstand wint het midden van het hart",
    x.soort === "midden", JSON.stringify(x));
}

log("\n── filteren op bouwsteen (slepen) ──────────────────────────────────");
{
  const pt = snapPunten(maakTweePlaten(), [], { y: 250, z: 80 });
  const naar = projectie(1.3);
  // Vastpakken: alleen de punten van de bouwsteen zelf tellen mee.
  const eigen = pt.filter((p) => p.id === "l1");
  check("eigen punten: 9 stuks", eigen.length === 9, String(eigen.length));
  check("vastpakken vangt op een eigen hoekpunt",
    (() => { const v = dichtstbijzijndeSnap(eigen, naar, ...naar(199, 19), STRAAL);
      return v && exact(v.y, 200) && exact(v.z, 20); })());
  // Neerzetten: de meebewegende bouwsteen en het zwaartepunt vallen af.
  const anderen = pt.filter((p) => p.id !== "l1" && p.soort !== "zwaartepunt");
  check("neerzetten: geen enkel punt van de gesleepte bouwsteen",
    anderen.every((p) => p.id !== "l1"));
  check("neerzetten: het meeschuivende zwaartepunt telt niet mee",
    anderen.every((p) => p.soort !== "zwaartepunt"));
  check("neerzetten vangt niet op het eigen hoekpunt",
    dichtstbijzijndeSnap(anderen, naar, ...naar(200, 20), STRAAL) === null);
}

log("\n── twee klikken: hoekpunt exact op hoekpunt ────────────────────────");
{
  const o = maakTweePlaten();
  const pt = snapPunten(o, [], null);
  const naar = projectie(1.3);

  // Basispunt: rechtsboven van l1. Doelpunt: linksonder van l2. De muis staat
  // er telkens een paar schermeenheden naast.
  const basis = dichtstbijzijndeSnap(pt, naar, ...[naar(200, 20)[0] + 3, naar(200, 20)[1] - 5], STRAAL);
  const doel = dichtstbijzijndeSnap(pt, naar, ...[naar(394, 0)[0] - 6, naar(394, 0)[1] + 2], STRAAL);
  check("basispunt is het hoekpunt (200, 20)", exact(basis.y, 200) && exact(basis.z, 20));
  check("doelpunt is het hoekpunt (394, 0)", exact(doel.y, 394) && exact(doel.z, 0));

  const na = verplaats(o, "l1", doel.y - basis.y, doel.z - basis.z);
  check("het hart schuift naar (294, −10)",
    exact(na.lamellen[0].y_mm, 294) && exact(na.lamellen[0].z_mm, -10),
    `(${na.lamellen[0].y_mm}, ${na.lamellen[0].z_mm})`);
  check("de andere lamel blijft ongemoeid",
    JSON.stringify(na.lamellen[1]) === JSON.stringify(o.lamellen[1]));

  const naPt = snapPunten(na, [], null);
  const geland = naPt.find((p) => p.id === "l1" && p.soort === "hoek" && exact(p.y, 394) && exact(p.z, 0));
  const doelPunt = naPt.find((p) => p.id === "l2" && p.soort === "hoek" && exact(p.y, 394) && exact(p.z, 0));
  check("het opgepakte hoekpunt ligt op (394, 0)", !!geland,
    JSON.stringify(naPt.filter((p) => p.id === "l1" && p.soort === "hoek")));
  check("en valt EXACT samen met het aangewezen hoekpunt (verschil 0, niet ~0)",
    !!doelPunt && Object.is(geland.y - doelPunt.y, 0) && Object.is(geland.z - doelPunt.z, 0));
}

log("\n── twee klikken op een schuine lamel ───────────────────────────────");
{
  const schuin = {
    soort: "samenstelling",
    celMeenemen: false,
    lamellen: [
      { id: "l1", b_mm: 200, t_mm: 20, y_mm: 100, z_mm: 10, alphaGraden: 0 },
      { id: "l3", b_mm: 100, t_mm: 10, y_mm: 0, z_mm: 200, alphaGraden: 30 },
    ],
    catalogusdelen: [],
  };
  const pt = snapPunten(schuin, [], null);
  const c = Math.cos(Math.PI / 6);
  const sn = Math.sin(Math.PI / 6);
  // Hoekpunt (+50, −5) in de eigen assen van de lamel, op het rooster gelegd.
  const rond = (v) => Math.round(v * 1e4) / 1e4;
  const vy = rond(50 * c + 5 * sn);
  const vz = rond(200 + 50 * sn - 5 * c);
  const hoek = pt.find((p) => p.id === "l3" && p.soort === "hoek" && exact(p.y, vy) && exact(p.z, vz));
  check("hoekpunt van de schuine lamel volgt de rotatieformule, op 0,0001",
    !!hoek, `verwacht (${vy}, ${vz})`);

  const doel = op(pt, 100, 20, "midden");
  check("zijdemidden van de liggende plaat is (100, 20)", !!doel);
  const na = verplaats(schuin, "l3", doel.y - hoek.y, doel.z - hoek.z);
  const naPt = snapPunten(na, [], null);
  const geland = naPt.find((p) => p.id === "l3" && p.soort === "hoek" && exact(p.y, 100) && exact(p.z, 20));
  check("hoekpunt landt exact op het zijdemidden (100, 20)", !!geland,
    JSON.stringify(naPt.filter((p) => p.id === "l3" && p.soort === "hoek")));
}

log("\n── catalogusdelen ──────────────────────────────────────────────────");
{
  const o = {
    soort: "samenstelling",
    celMeenemen: false,
    lamellen: [],
    catalogusdelen: [{ id: "d1", profiel: HEA200, y_mm: 0, z_mm: 0, alphaGraden: 0, gespiegeld: false }],
  };
  const pt = snapPunten(o, [], null);
  // Zonder motoruitvoer ligt het zwaartepunt van het deel op (b/2, h/2) =
  // (100, 95); de omhullende loopt dan van (−100, −95) tot (100, 95).
  check("hoekpunt linksonder van de omhullende (−100, −95)", !!op(pt, -100, -95, "hoek"));
  check("hoekpunt rechtsboven van de omhullende (100, 95)", !!op(pt, 100, 95, "hoek"));
  check("midden bovenzijde (0, 95)", !!op(pt, 0, 95, "midden"));
  check("hart van het deel (0, 0)", !!op(pt, 0, 0, "hart"));
  check("negen punten, allemaal met id d1",
    pt.length === 9 && pt.every((p) => p.id === "d1"), String(pt.length));

  const gedraaid = snapPunten(
    { ...o, catalogusdelen: [{ ...o.catalogusdelen[0], alphaGraden: 90 }] }, [], null,
  );
  check("een kwartslag draait de omhullende exact mee: (95, −100)",
    !!op(gedraaid, 95, -100, "hoek"),
    JSON.stringify(gedraaid.filter((p) => p.soort === "hoek")));
}

log("\n── profiel met gaten ───────────────────────────────────────────────");
{
  const o = {
    soort: "gat",
    basis: IPE300,
    gaten: [
      { id: "g1", plaats: "lijf", vorm: "rond", y: 75, z: 150, d: 80, b: 0, h: 0, hoekGraden: 0 },
      { id: "g2", plaats: "flensBoven", vorm: "rond", y: 40, z: 295, d: 20, b: 0, h: 0, hoekGraden: 0 },
    ],
  };
  const pt = snapPunten(o, [], null);
  check("omhullende hoek linksonder (0, 0)", !!op(pt, 0, 0, "hoek"));
  check("omhullende hoek rechtsboven (150, 300)", !!op(pt, 150, 300, "hoek"));
  check("midden onderzijde (75, 0)", !!op(pt, 75, 0, "midden"));
  check("hart van het basisprofiel (75, 150)", !!op(pt, 75, 150, "hart"));
  check("het basisprofiel draagt het id 'basis'",
    pt.filter((p) => p.id === "basis").length === 9);
  // Een lijfgat wordt op de hartlijn van het lijf getekend, een flensgat op
  // het hart van zijn flens — daar hoort het snappunt dus ook te liggen.
  check("lijfgat op de lijfhartlijn (75, 150)",
    !!pt.find((p) => p.id === "g1" && exact(p.y, 75) && exact(p.z, 150)));
  check("flensgat op het hart van de bovenflens (40, 294,65)",
    !!pt.find((p) => p.id === "g2" && exact(p.y, 40) && exact(p.z, 294.65)),
    JSON.stringify(pt.filter((p) => p.id === "g2")));
}

log("\n── namen in beeld ──────────────────────────────────────────────────");
{
  for (const soort of ["hoek", "midden", "hart", "zwaartepunt", "raster", "vrij"]) {
    check(`VANG_NAAM kent '${soort}'`,
      typeof VANG_NAAM[soort] === "string" && VANG_NAAM[soort].length > 0);
  }
  check("hoek heet 'hoekpunt' in beeld", VANG_NAAM.hoek === "hoekpunt");
}

log(`\n${failed === 0 ? "ALLE TESTS GESLAAGD" : "TESTS GEFAALD"} — ${passed} ok, ${failed} fout\n`);
process.exit(failed === 0 ? 0 : 1);
