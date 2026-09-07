// Unit-checks voor het lagenmodel en de lasnaden in de profieleditor
// (src/lib/profieleditor/lagenmodel.ts en src/lib/profieleditor/lassen.ts).
//
// Waarom deze twee in één bestand: ze rekenen op dezelfde doorsnede en met
// dezelfde grootheden. Het lagenmodel levert de breedtefunctie b(z) waarmee de
// spanningskern σ_x, τ en σ_eq bepaalt; de lassen halen uit diezelfde
// plaatverdeling het statisch moment van het deel dat aan de naad hangt.
//
// Regels onder test:
//   - het strokenmodel van een gelaste ligger geeft EXACT de handberekening:
//     A = Σb·t, z_c op halve hoogte, I_y uit de Steiner-som, en S(z_c) uit de
//     integraal van b(z)·(z − z_c)
//   - een gedraaide plaat komt met zijn eigen I_y terug: voor een rechthoek
//     onder 45° is dat (b·t³ + t·b³)/24
//   - overlappende platen tellen dubbel, net als in het lamellenmodel van de
//     doorsnedemotor — anders zouden editor en motor uit elkaar lopen
//   - een doorsnede die uit elkaar valt levert een melding op, geen getal
//   - een catalogusdeel dat rechtop staat wordt flens–lijf–flens; gedraaid
//     levert het een melding
//   - een gat in een catalogusprofiel sluit het spanningsverloop uit, met reden
//   - de naadmeetkunde zet de rollen goed: bij een gelaste ligger eindigt het
//     LIJF op de FLENS, ook als de las als "flens–lijf" is aangemaakt
//   - de schuifstroom is q = V_z·S/I_y met S van het afgesneden deel, en beide
//     kanten van de snede geven dezelfde |S|
//   - een gesloten koker is statisch onbepaald: geen getal, wel een reden
// Uitvoeren: npx tsx test-profieleditor-lassen.mjs

const { lagenVanSamenstelling, doorsnedeVanOntwerp, sBovenMm3 } = await import(
  "./src/lib/profieleditor/lagenmodel.ts"
);
const {
  mogelijkeNaden,
  naadmeetkunde,
  schuifstroomVanLas,
  keeldoorsneden,
  voorgesteldeKeeldikte,
} = await import("./src/lib/profieleditor/lassen.ts");

let passed = 0;
let failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    log(`  ✓ ${name}`);
  } else {
    failed++;
    log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function bijna(a, b, tol = 1e-9) {
  return Math.abs(a - b) <= tol;
}
function relatief(a, b, pct) {
  return Math.abs(a - b) <= (Math.abs(b) * pct) / 100;
}

/** Gelaste ligger: flenzen 200×15 op z = ±207,5, lijf 400×10 (h = 430). */
function gelasteI() {
  return {
    soort: "samenstelling",
    celMeenemen: true,
    lamellen: [
      { id: "bovenflens", b_mm: 200, t_mm: 15, y_mm: 0, z_mm: 207.5, alphaGraden: 0 },
      { id: "onderflens", b_mm: 200, t_mm: 15, y_mm: 0, z_mm: -207.5, alphaGraden: 0 },
      { id: "lijf", b_mm: 400, t_mm: 10, y_mm: 0, z_mm: 0, alphaGraden: 90 },
    ],
    catalogusdelen: [],
    lassen: [],
  };
}

/** Koker uit vier platen: boven/onder 180×10 op z = ±95, zijden 200×10 op y = ±95. */
function koker() {
  return {
    soort: "samenstelling",
    celMeenemen: true,
    lamellen: [
      { id: "boven", b_mm: 180, t_mm: 10, y_mm: 0, z_mm: 95, alphaGraden: 0 },
      { id: "onder", b_mm: 180, t_mm: 10, y_mm: 0, z_mm: -95, alphaGraden: 0 },
      { id: "links", b_mm: 200, t_mm: 10, y_mm: -95, z_mm: 0, alphaGraden: 90 },
      { id: "rechts", b_mm: 200, t_mm: 10, y_mm: 95, z_mm: 0, alphaGraden: 90 },
    ],
    catalogusdelen: [],
    lassen: [],
  };
}

// ── 1. Lagenmodel van een gelaste ligger ────────────────────────────────────
log("\nLagenmodel — gelaste ligger 200×15 / 400×10");
{
  const o = gelasteI();
  const m = lagenVanSamenstelling(o.lamellen, o.catalogusdelen);
  check("model komt terug (geen melding)", typeof m !== "string", String(m));
  if (typeof m !== "string") {
    check("drie stroken", m.lagen.length === 3, `was ${m.lagen.length}`);
    check("hoogte 430 mm", bijna(m.hoogte_mm, 430), String(m.hoogte_mm));
    check("A = 10 000 mm²", bijna(m.a_mm2, 10000, 1e-6), String(m.a_mm2));
    check("z_c = 215 mm vanaf boven", bijna(m.z_c_mm, 215, 1e-9), String(m.z_c_mm));
    // I_y = 2·(200·15³/12 + 3000·207,5²) + 10·400³/12
    const iyHand = 2 * ((200 * 15 ** 3) / 12 + 3000 * 207.5 ** 2) + (10 * 400 ** 3) / 12;
    check(
      `I_y = ${iyHand.toFixed(0)} mm⁴`,
      bijna(m.iy_mm4, iyHand, 1e-6),
      `${m.iy_mm4} vs ${iyHand}`,
    );
    // Bovenste strook is de flens, middelste het lijf.
    check("bovenste strook 200 mm breed", bijna(m.lagen[0].breedte_mm, 200));
    check("middelste strook 10 mm breed", bijna(m.lagen[1].breedte_mm, 10));
    // S op de zwaartelijn: 200·15·207,5 + 10·200²/2 = 622 500 + 200 000.
    check(
      "S(z_c) = 822 500 mm³",
      bijna(sBovenMm3(m, 215), 822500, 1e-6),
      String(sBovenMm3(m, 215)),
    );
    check("S aan de bovenrand is 0", bijna(sBovenMm3(m, 0), 0, 1e-9));
    check("S aan de onderrand is 0", bijna(sBovenMm3(m, 430), 0, 1e-6));
  }
}

// ── 2. Gedraaide plaat ──────────────────────────────────────────────────────
log("\nLagenmodel — één plaat 100×10 onder 45°");
{
  const m = lagenVanSamenstelling(
    [{ id: "p", b_mm: 100, t_mm: 10, y_mm: 0, z_mm: 0, alphaGraden: 45 }],
    [],
  );
  check("model komt terug", typeof m !== "string", String(m));
  if (typeof m !== "string") {
    // Oppervlak is exact: A = ∫b(z)dz, en de koorde is per band lineair.
    check("A = 1000 mm²", relatief(m.a_mm2, 1000, 0.01), String(m.a_mm2));
    // I_y van een rechthoek onder 45°: (b·t³ + t·b³)/24.
    const iyHand = (100 * 10 ** 3 + 10 * 100 ** 3) / 24;
    check(
      `I_y ≈ ${iyHand.toFixed(0)} mm⁴ (binnen 1 %)`,
      relatief(m.iy_mm4, iyHand, 1),
      `${m.iy_mm4} vs ${iyHand}`,
    );
    check(
      "meldt dat een gedraaide plaat in substroken is verdeeld",
      m.meldingen.some((t) => t.includes("substroken")),
      m.meldingen.join(" | "),
    );
  }
}

// ── 3. Overlap telt dubbel, net als in het lamellenmodel van de motor ───────
log("\nLagenmodel — overlappende platen");
{
  // T-profiel: staand lijf 100×10 en liggende flens 100×10 die elkaar over
  // 10×10 mm overlappen. Σb·t = 2000 mm², inclusief de overlap.
  const m = lagenVanSamenstelling(
    [
      { id: "lijf", b_mm: 100, t_mm: 10, y_mm: 0, z_mm: 0, alphaGraden: 90 },
      { id: "flens", b_mm: 100, t_mm: 10, y_mm: 0, z_mm: 45, alphaGraden: 0 },
    ],
    [],
  );
  check("model komt terug", typeof m !== "string", String(m));
  if (typeof m !== "string") {
    check("A = 2000 mm² (overlap telt dubbel)", bijna(m.a_mm2, 2000, 1e-6), String(m.a_mm2));
    check(
      "de overlapstrook is 110 mm breed (100 + 10)",
      m.lagen.some((l) => bijna(l.breedte_mm, 110, 1e-6)),
      m.lagen.map((l) => l.breedte_mm).join(", "),
    );
  }
}

// ── 4. Losse delen ──────────────────────────────────────────────────────────
log("\nLagenmodel — losse delen");
{
  const m = lagenVanSamenstelling(
    [
      { id: "a", b_mm: 100, t_mm: 10, y_mm: 0, z_mm: 0, alphaGraden: 0 },
      { id: "b", b_mm: 100, t_mm: 10, y_mm: 0, z_mm: 100, alphaGraden: 0 },
    ],
    [],
  );
  check("geeft een melding in plaats van een getal", typeof m === "string", JSON.stringify(m));
  if (typeof m === "string") {
    check("de melding noemt losse delen", m.includes("losse delen"), m);
  }
}

// ── 5. Catalogusdeel ────────────────────────────────────────────────────────
log("\nLagenmodel — catalogusdeel");
{
  const hea200 = { naam: "HEA200", soort: "ISection", h: 190, b: 200, tw: 6.5, tf: 10, r: 18 };
  const rechtop = lagenVanSamenstelling(
    [],
    [{ id: "d", profiel: hea200, y_mm: 0, z_mm: 0, alphaGraden: 0, gespiegeld: false }],
  );
  check("rechtop: model komt terug", typeof rechtop !== "string", String(rechtop));
  if (typeof rechtop !== "string") {
    check("drie stroken (flens, lijf, flens)", rechtop.lagen.length === 3, String(rechtop.lagen.length));
    check("hoogte 190 mm", bijna(rechtop.hoogte_mm, 190), String(rechtop.hoogte_mm));
    // A van het rechte plaatmodel = 2·200·10 + 170·6,5 = 5105 mm² (zonder de
    // walsuitrondingen; die zitten niet in dit model en dat wordt gemeld).
    check("A van het rechte plaatmodel = 5105 mm²", bijna(rechtop.a_mm2, 5105, 1e-6), String(rechtop.a_mm2));
    check(
      "meldt dat de walsuitrondingen er niet in zitten",
      rechtop.meldingen.some((t) => t.includes("walsuitronding")),
      rechtop.meldingen.join(" | "),
    );
  }
  const gedraaid = lagenVanSamenstelling(
    [],
    [{ id: "d", profiel: hea200, y_mm: 0, z_mm: 0, alphaGraden: 30, gespiegeld: false }],
  );
  check("gedraaid: melding in plaats van een getal", typeof gedraaid === "string", String(gedraaid));
}

// ── 6. Gat in een catalogusprofiel ──────────────────────────────────────────
log("\nDoorsnede-invoer — catalogusprofiel met en zonder gat");
{
  const ipe = { naam: "IPE300", soort: "ISection", h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15 };
  const zonder = doorsnedeVanOntwerp({ soort: "gat", basis: ipe, gaten: [] });
  check("zonder gat: gaat als catalogusprofiel", typeof zonder !== "string" && zonder.doorsnede.vorm === "Catalogus", JSON.stringify(zonder));
  const met = doorsnedeVanOntwerp({
    soort: "gat",
    basis: ipe,
    gaten: [{ id: "g", plaats: "lijf", vorm: "rond", y: 75, z: 150, d: 60, b: 60, h: 60, hoekGraden: 0 }],
  });
  check("met gat: melding in plaats van een verloop", typeof met === "string", JSON.stringify(met));
  if (typeof met === "string") check("de melding noemt het gat", met.includes("gat"), met);
}

// ── 7. Naadmeetkunde: welke plaat eindigt op welke ──────────────────────────
log("\nLassen — naadmeetkunde");
{
  const o = gelasteI();
  const [flens, , lijf] = o.lamellen;
  // Aangemaakt als flens–lijf; de meetkunde hoort te zien dat het LIJF eindigt.
  const m = naadmeetkunde(flens, lijf);
  check("meetkunde komt terug", m !== null);
  if (m) {
    check("naadpunt op het flensoppervlak (0; 200)", bijna(m.punt.y, 0, 1e-9) && bijna(m.punt.z, 200, 1e-9), `${m.punt.y}; ${m.punt.z}`);
    check("steel is het lijf (dikte 10 mm)", bijna(m.tA, 10), String(m.tA));
    check("langs de steel wijst het lijf in (0; −1)", bijna(m.langsA.y, 0, 1e-9) && bijna(m.langsA.z, -1, 1e-9), `${m.langsA.y}; ${m.langsA.z}`);
  }
  // Andersom aangemaakt moet hetzelfde punt geven.
  const m2 = naadmeetkunde(lijf, flens);
  check(
    "volgorde van de twee platen doet er niet toe",
    m2 !== null && bijna(m2.punt.y, m.punt.y, 1e-9) && bijna(m2.punt.z, m.punt.z, 1e-9),
    m2 ? `${m2.punt.y}; ${m2.punt.z}` : "null",
  );
}

// ── 8. Naden herkennen ──────────────────────────────────────────────────────
log("\nLassen — naden herkennen");
{
  const o = gelasteI();
  const k = mogelijkeNaden(o.lamellen, []);
  check("gelaste ligger heeft twee naden", k.length === 2, String(k.length));
  check(
    "beide naden lopen naar het lijf",
    k.every((n) => n.aId === "lijf" || n.bId === "lijf"),
    JSON.stringify(k),
  );
  const bezet = mogelijkeNaden(o.lamellen, [
    { id: "L1", aId: k[0].aId, bId: k[0].bId, soort: "HoeklasDubbel", a_mm: 5 },
  ]);
  check("een naad met las telt niet meer mee", bezet.length === 1, String(bezet.length));
  check("koker heeft vier naden", mogelijkeNaden(koker().lamellen, []).length === 4);
  check("keeldoorsneden: dubbel = 2, enkel = 1, stomp = 0", keeldoorsneden("HoeklasDubbel") === 2 && keeldoorsneden("HoeklasEnkel") === 1 && keeldoorsneden("StompVolledig") === 0);
  check(
    "voorgestelde keeldikte 0,7·t van de dunste plaat, minimaal 3",
    voorgesteldeKeeldikte({ t_mm: 15 }, { t_mm: 10 }) === 7 && voorgesteldeKeeldikte({ t_mm: 3 }, { t_mm: 3 }) === 3,
    String(voorgesteldeKeeldikte({ t_mm: 15 }, { t_mm: 10 })),
  );
}

// ── 9. Schuifstroom door de naad ────────────────────────────────────────────
log("\nLassen — schuifstroom q = V_z·S/I_y");
{
  const o = gelasteI();
  const iy = 2 * ((200 * 15 ** 3) / 12 + 3000 * 207.5 ** 2) + (10 * 400 ** 3) / 12;
  const las = { id: "L1", aId: "bovenflens", bId: "lijf", soort: "HoeklasDubbel", a_mm: 7 };
  const r = schuifstroomVanLas(las, o.lamellen, [las], 0, iy, 100, 0);
  check("schuifstroom komt terug", typeof r !== "string", String(r));
  if (typeof r !== "string") {
    check("het afgesneden deel is één plaat", r.platen === 1, String(r.platen));
    check("S = 200·15·207,5 = 622 500 mm³", bijna(r.s_mm3, 622500, 1e-6), String(r.s_mm3));
    const qHand = (100 * 1e3 * 622500) / iy;
    check(`q = ${qHand.toFixed(3)} N/mm`, bijna(r.q_n_per_mm, qHand, 1e-9), String(r.q_n_per_mm));
  }
  // De andere kant van de snede geeft dezelfde |S|: het lijf plus de onderflens.
  const andersom = { ...las, aId: "lijf", bId: "bovenflens" };
  const r2 = schuifstroomVanLas(andersom, o.lamellen, [andersom], 0, iy, 100, 0);
  check(
    "beide kanten van de snede geven dezelfde |S|",
    typeof r2 !== "string" && bijna(r2.s_mm3, 622500, 1e-6) && r2.platen === 2,
    typeof r2 === "string" ? r2 : `${r2.s_mm3} / ${r2.platen} platen`,
  );
  // Zonder dwarskracht is er geen schuifstroom, maar S blijft staan.
  const r0 = schuifstroomVanLas(las, o.lamellen, [las], 0, iy, 0, 0);
  check("V = 0 geeft q = 0", typeof r0 !== "string" && r0.q_n_per_mm === 0);
  // Catalogusdelen sluiten de bepaling uit.
  const rC = schuifstroomVanLas(las, o.lamellen, [las], 0, iy, 100, 1);
  check("met een catalogusdeel: melding", typeof rC === "string" && rC.includes("catalogusdelen"), String(rC));
}

// ── 10. Gesloten koker is statisch onbepaald ────────────────────────────────
log("\nLassen — gesloten koker");
{
  const o = koker();
  const naden = mogelijkeNaden(o.lamellen, []);
  const lassen = naden.map((n, i) => ({
    id: `L${i}`,
    aId: n.aId,
    bId: n.bId,
    soort: "HoeklasDubbel",
    a_mm: 5,
  }));
  const r = schuifstroomVanLas(lassen[0], o.lamellen, lassen, 0, 1e8, 100, 0);
  check("geen getal", typeof r === "string", JSON.stringify(r));
  if (typeof r === "string") {
    check("de melding noemt statisch onbepaald", r.includes("statisch onbepaald"), r);
  }
}

log("");
log(`${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
