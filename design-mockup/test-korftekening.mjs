// De wapening in de doorsnedetekening — staat hij op de JUISTE PLAATS.
//
// Sinds de profielkiezer de betondoorsnede met `beton/DoorsnedeTekening`
// tekent in plaats van met `shared/ProfielMiniatuur`, zie je de korf die je
// rechts invult meteen links terug. Dat is alleen wat waard als de staven ook
// werkelijk liggen waar ze in de balk liggen. Een test die alleen telt DAT er
// cirkels staan, zegt daar niets over: vier staven op een hoop in het midden
// zijn ook vier cirkels.
//
// Deze test rendert de component dus echt (react-dom/server) en leest de
// meetkunde TERUG UIT DE SVG:
//
//   1. de schaal wordt uit de OMTREK afgeleid — de breedte van de getekende
//      polygoon gedeeld door b, en de hoogte gedeeld door h. Die twee horen
//      gelijk te zijn: een tekening op ware schaal, geen uitgerekte;
//   2. met die schaal gaat elk staafhart terug naar millimeters, en pas dáár
//      wordt vergeleken met wat de dekkingsregel voorschrijft:
//      afstand tot de rand = c_nom + Ø_beugel + Ø_hoofd / 2;
//   3. elke staaf moet met zijn hele diameter BINNEN de getekende omtrek
//      liggen. Dat is een echte puntsgewijze meetkundecontrole op de polygoon
//      (ligt-in + afstand tot elke zijde) en niet een grens op x, want juist
//      bij een T en een L is de omtrek geen rechthoek: een rij in het lijf
//      moet in het LIJF passen, ook al is de doorsnede daarboven vier keer zo
//      breed. Daar ontstaan tekenfouten, en daar vangt deze test ze.
//
// De verwachte millimeters worden hier opnieuw uitgeschreven (48 mm, 44 mm,
// …) in plaats van uit `wapeningskorf.ts` gehaald. Zou de test dezelfde
// functie aanroepen die de tekening gebruikt, dan toetst hij zichzelf.
//
// DE HALVE KORF krijgt een eigen blok. Tijdens het typen klopt de korf
// geregeld even niet, en dan tekent de profielkiezer met `wapening={false}`
// alleen het beton. Hier staat vast wat dat betekent (geen staaf, geen beugel,
// geen d-maat, geen dekking in het onderschrift, en een aria-label dat geen
// wapening claimt) én WAAROM het nodig is: met de schakelaar aan zou dezelfde
// afgekeurde korf staven buiten het beton neerzetten.
//
// Draaien met: npx tsx test-korftekening.mjs
//          (of: node scripts/run-tests.mjs --filter=korftekening)

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const DoorsnedeTekening = (await import("./src/components/beton/DoorsnedeTekening.tsx")).default;
const { STANDAARD_KORF, controleerKorf, rechthoek } = await import(
  "./src/components/beton/wapeningskorf.ts"
);

let passed = 0,
  failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkTrue(naam, voorwaarde, toelichting = "") {
  if (voorwaarde) {
    passed++;
    log(`  ✓ ${naam}`);
  } else {
    failed++;
    log(`  ✗ ${naam}${toelichting ? `: ${toelichting}` : ""}`);
  }
}

/** Vergelijking op millimeters; 0,05 mm is ruim onder elke tekenfout. */
const MM = 0.05;
function checkMm(naam, werkelijk, verwacht) {
  checkTrue(
    naam,
    Number.isFinite(werkelijk) && Math.abs(werkelijk - verwacht) <= MM,
    `${werkelijk} mm in plaats van ${verwacht} mm`,
  );
}
function checkEq(naam, werkelijk, verwacht) {
  checkTrue(naam, werkelijk === verwacht, `${werkelijk} in plaats van ${verwacht}`);
}

// ── De SVG uit elkaar halen ───────────────────────────────────────────────

const korfVan = (doorsnede, rijen) => ({
  ...STANDAARD_KORF,
  doorsnede,
  korf: { ...STANDAARD_KORF.korf, ...rijen },
});
const tee = (b, h, bw, hf, flensOnder = false) => ({
  shape: "Tee",
  b_mm: b,
  h_mm: h,
  b_w_mm: bw,
  h_f_mm: hf,
  flange_at_bottom: flensOnder,
});
const ell = (b, h, bw, hf, flensOnder = false) => ({ ...tee(b, h, bw, hf, flensOnder), shape: "Ell" });

function teken(korf, props = {}) {
  return renderToStaticMarkup(React.createElement(DoorsnedeTekening, { korf, ...props }));
}

/** De eerste `<polygon points=…>` is het beton; de pijlpunten komen later. */
function omtrekVan(html) {
  const m = /<polygon points="([^"]*)"/.exec(html);
  if (!m) throw new Error("geen omtrekpolygoon in de SVG");
  return m[1]
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number));
}

function cirkelsVan(html) {
  return [...html.matchAll(/<circle cx="([^"]*)" cy="([^"]*)" r="([^"]*)"/g)].map((m) => ({
    cx: Number(m[1]),
    cy: Number(m[2]),
    r: Number(m[3]),
  }));
}

/** De beugel is de enige `<rect>` in de tekening. */
function beugelVan(html) {
  const m = /<rect x="([^"]*)" y="([^"]*)" width="([^"]*)" height="([^"]*)"/.exec(html);
  return m
    ? { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) }
    : null;
}

const tekstenVan = (html) => [...html.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const ariaVan = (html) => /aria-label="([^"]*)"/.exec(html)?.[1] ?? "";

/**
 * Het meetlint: schaal en oorsprong uit de GETEKENDE omtrek, niet uit de
 * component. Zo wordt alles hierna in millimeters vergeleken en hoeft geen
 * enkele verwachting in pixels te worden opgeschreven.
 */
function meetlint(html, bMm, hMm) {
  const omtrek = omtrekVan(html);
  const xs = omtrek.map((p) => p[0]);
  const ys = omtrek.map((p) => p[1]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  return {
    omtrek,
    sX: (xMax - xMin) / bMm,
    sY: (yMax - yMin) / hMm,
    // x vanaf de linkerrand, z vanaf de ONDERRAND — het scherm telt omgekeerd.
    xMm: (px) => (px - xMin) / ((xMax - xMin) / bMm),
    zMm: (py) => (yMax - py) / ((yMax - yMin) / hMm),
    lengteMm: (pxLengte) => pxLengte / ((xMax - xMin) / bMm),
  };
}

// ── Ligt een cirkel volledig binnen de omtrek ─────────────────────────────

function inPolygoon([x, y], punten) {
  let binnen = false;
  for (let i = 0, j = punten.length - 1; i < punten.length; j = i++) {
    const [xi, yi] = punten[i];
    const [xj, yj] = punten[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) binnen = !binnen;
  }
  return binnen;
}

/** Kortste afstand van een punt tot een lijnstuk. */
function afstandTotLijnstuk([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Kortste afstand van een punt tot de rand van de polygoon. */
function afstandTotRand(punt, punten) {
  let d = Infinity;
  for (let i = 0, j = punten.length - 1; i < punten.length; j = i++) {
    d = Math.min(d, afstandTotLijnstuk(punt, punten[i], punten[j]));
  }
  return d;
}

// ══ 1. Rechthoek ══════════════════════════════════════════════════════════
//
// c_nom 30, beugel Ø8 (uit STANDAARD_KORF). De staafas ligt dus op
// 30 + 8 + Ø/2 vanaf de rand: 48 mm voor Ø20 en 44 mm voor Ø12.
log("1. Rechthoek 300 × 500 — 4Ø20 onder, 2Ø12 boven");
{
  const korf = korfVan(rechthoek(300, 500), {
    bottom: { count: 4, diameter_mm: 20 },
    top: { count: 2, diameter_mm: 12 },
  });
  checkEq("de korf is geldig", controleerKorf(korf), null);
  const html = teken(korf);
  const m = meetlint(html, 300, 500);
  checkTrue(
    "ware schaal: breedte en hoogte op dezelfde factor",
    Math.abs(m.sX - m.sY) < 1e-9,
    `${m.sX} tegen ${m.sY}`,
  );

  const cirkels = cirkelsVan(html);
  checkEq("zes staven getekend", cirkels.length, 6);
  const staven = cirkels
    .map((c) => ({ x: m.xMm(c.cx), z: m.zMm(c.cy), d: m.lengteMm(c.r) * 2 }))
    .sort((a, b) => a.z - b.z || a.x - b.x);
  const onder = staven.filter((s) => s.z < 250);
  const boven = staven.filter((s) => s.z >= 250);
  checkEq("vier staven onder", onder.length, 4);
  checkEq("twee staven boven", boven.length, 2);

  checkMm("onderwapening op z = c + Ø_bgl + Ø/2", onder[0].z, 48);
  checkMm("alle vier op dezelfde hoogte", Math.max(...onder.map((s) => s.z)), 48);
  checkMm("Ø20 op ware diameter getekend", onder[0].d, 20);
  // Gelijkmatig van 48 tot 300 − 48 = 252: hart-op-hart 68 mm.
  for (const [i, verwacht] of [48, 116, 184, 252].entries()) {
    checkMm(`onderstaaf ${i + 1} op x = ${verwacht}`, onder[i].x, verwacht);
  }
  checkMm("bovenwapening op z = h − (c + Ø_bgl + Ø/2)", boven[0].z, 456);
  checkMm("bovenstaaf links op x = 44", boven[0].x, 44);
  checkMm("bovenstaaf rechts op x = 256", boven[1].x, 256);
  checkMm("Ø12 op ware diameter getekend", boven[0].d, 12);

  for (const c of cirkels) {
    checkTrue(
      `staaf (${c.cx.toFixed(1)}, ${c.cy.toFixed(1)}) ligt met zijn hele diameter in het beton`,
      inPolygoon([c.cx, c.cy], m.omtrek) && afstandTotRand([c.cx, c.cy], m.omtrek) >= c.r - 1e-9,
    );
  }

  // De beugel: binnenwerks c + Ø_bgl/2 vanaf elke rand, dus 34 mm.
  const beugel = beugelVan(html);
  checkMm("beugel 34 mm van de linkerrand", m.xMm(beugel.x), 34);
  checkMm("beugelbreedte 300 − 2 × 34", m.lengteMm(beugel.w), 232);
  checkMm("beugel 34 mm onder de bovenrand", m.zMm(beugel.y), 466);
  checkMm("beugelhoogte 500 − 2 × 34", m.lengteMm(beugel.h), 432);

  const teksten = tekstenVan(html);
  checkTrue("rijlabel 4Ø20 staat in de tekening", teksten.includes("4Ø20"), teksten.join(" | "));
  checkTrue("rijlabel 2Ø12 staat in de tekening", teksten.includes("2Ø12"), teksten.join(" | "));
  checkTrue(
    "de maatlijnen b en h staan er",
    teksten.includes("b 300") && teksten.includes("h 500"),
    teksten.join(" | "),
  );
  // d = h − (c + Ø_bgl + Ø/2) = 500 − 48.
  checkTrue("de nuttige hoogte d staat erbij", teksten.includes("d 452"), teksten.join(" | "));
}

// ══ 2. T-ligger: de rij in het lijf blijft in het lijf ════════════════════
log("2. T 1200 × 450, b_w 300, h_f 120 (flens boven) — 4Ø20 onder, 4Ø12 boven");
{
  const korf = korfVan(tee(1200, 450, 300, 120), {
    bottom: { count: 4, diameter_mm: 20 },
    top: { count: 4, diameter_mm: 12 },
  });
  checkEq("de korf is geldig", controleerKorf(korf), null);
  const html = teken(korf);
  const m = meetlint(html, 1200, 450);
  checkTrue("ware schaal", Math.abs(m.sX - m.sY) < 1e-9, `${m.sX} tegen ${m.sY}`);
  checkEq("de omtrek heeft acht hoekpunten (T)", m.omtrek.length, 8);

  const cirkels = cirkelsVan(html);
  const staven = cirkels
    .map((c) => ({ x: m.xMm(c.cx), z: m.zMm(c.cy), r: c.r, cx: c.cx, cy: c.cy }))
    .sort((a, b) => a.z - b.z || a.x - b.x);
  const onder = staven.filter((s) => s.z < 225);
  const boven = staven.filter((s) => s.z >= 225);
  checkEq("vier staven onder, vier boven", `${onder.length}/${boven.length}`, "4/4");

  // Het lijf staat in het midden: van (1200 − 300)/2 = 450 tot 750.
  checkMm("onderwapening op z = 48", onder[0].z, 48);
  checkMm("eerste onderstaaf 48 mm binnen de LIJFrand", onder[0].x, 498);
  checkMm("laatste onderstaaf 48 mm binnen de lijfrand", onder[3].x, 702);
  checkTrue(
    "geen enkele onderstaaf steekt buiten het lijf",
    onder.every((s) => s.x >= 450 && s.x <= 750),
    onder.map((s) => s.x.toFixed(1)).join(", "),
  );

  // De bovenwapening ligt in de flens en mag wél over de volle b_eff.
  checkMm("bovenwapening op z = 450 − 44", boven[0].z, 406);
  checkMm("eerste bovenstaaf 44 mm van de flensrand", boven[0].x, 44);
  checkMm("laatste bovenstaaf 44 mm van de flensrand", boven[3].x, 1156);

  for (const s of staven) {
    checkTrue(
      `staaf op x = ${s.x.toFixed(0)}, z = ${s.z.toFixed(0)} ligt geheel in het beton`,
      inPolygoon([s.cx, s.cy], m.omtrek) && afstandTotRand([s.cx, s.cy], m.omtrek) >= s.r - 1e-9,
    );
  }

  // De beugel hoort om het LIJF, niet om de omhullende breedte.
  const beugel = beugelVan(html);
  checkMm("beugel begint 34 mm binnen de lijfrand", m.xMm(beugel.x), 484);
  checkMm("beugelbreedte 300 − 2 × 34", m.lengteMm(beugel.w), 232);
}

// ══ 3. L-ligger: het lijf staat tegen de linkerrand ═══════════════════════
log("3. L 900 × 500, b_w 300, h_f 150 (flens boven) — 3Ø25 onder, 2Ø12 boven");
{
  const korf = korfVan(ell(900, 500, 300, 150), {
    bottom: { count: 3, diameter_mm: 25 },
    top: { count: 2, diameter_mm: 12 },
  });
  checkEq("de korf is geldig", controleerKorf(korf), null);
  const html = teken(korf);
  const m = meetlint(html, 900, 500);
  const staven = cirkelsVan(html)
    .map((c) => ({ x: m.xMm(c.cx), z: m.zMm(c.cy), r: c.r, cx: c.cx, cy: c.cy }))
    .sort((a, b) => a.z - b.z || a.x - b.x);
  const onder = staven.filter((s) => s.z < 250);
  const boven = staven.filter((s) => s.z >= 250);
  checkEq("drie staven onder, twee boven", `${onder.length}/${boven.length}`, "3/2");

  // as = 30 + 8 + 12,5 = 50,5. Het lijf loopt bij een L van 0 tot 300.
  checkMm("onderwapening op z = 50,5", onder[0].z, 50.5);
  checkMm("eerste onderstaaf op x = 50,5", onder[0].x, 50.5);
  checkMm("middelste onderstaaf in het hart van het lijf (150)", onder[1].x, 150);
  checkMm("laatste onderstaaf op x = 300 − 50,5", onder[2].x, 249.5);
  checkTrue(
    "de onderwapening staat in het LIJF en niet in de uitkraging",
    onder.every((s) => s.x <= 300),
    onder.map((s) => s.x.toFixed(1)).join(", "),
  );
  checkMm("bovenstaaf links op x = 44", boven[0].x, 44);
  checkMm("bovenstaaf rechts op x = 856", boven[1].x, 856);

  for (const s of staven) {
    checkTrue(
      `staaf op x = ${s.x.toFixed(0)}, z = ${s.z.toFixed(0)} ligt geheel in het beton`,
      inPolygoon([s.cx, s.cy], m.omtrek) && afstandTotRand([s.cx, s.cy], m.omtrek) >= s.r - 1e-9,
    );
  }
}

// ══ 4. Omgekeerde T: de brede band ligt ONDER ═════════════════════════════
log("4. Omgekeerde T 900 × 500, b_w 300, h_f 150 (flens onder) — 5Ø16 onder, 2Ø12 boven");
{
  const korf = korfVan(tee(900, 500, 300, 150, true), {
    bottom: { count: 5, diameter_mm: 16 },
    top: { count: 2, diameter_mm: 12 },
  });
  checkEq("de korf is geldig", controleerKorf(korf), null);
  const html = teken(korf);
  const m = meetlint(html, 900, 500);
  const staven = cirkelsVan(html)
    .map((c) => ({ x: m.xMm(c.cx), z: m.zMm(c.cy), r: c.r, cx: c.cx, cy: c.cy }))
    .sort((a, b) => a.z - b.z || a.x - b.x);
  const onder = staven.filter((s) => s.z < 250);
  const boven = staven.filter((s) => s.z >= 250);
  checkEq("vijf staven onder, twee boven", `${onder.length}/${boven.length}`, "5/2");

  // as = 30 + 8 + 8 = 46; de onderrij ligt nu in de FLENS en mag dus breed.
  checkMm("eerste onderstaaf op x = 46", onder[0].x, 46);
  checkMm("laatste onderstaaf op x = 900 − 46", onder[4].x, 854);
  // De bovenrij zit in het lijf, dat van 300 tot 600 loopt.
  checkMm("bovenstaaf links 44 mm binnen de lijfrand", boven[0].x, 344);
  checkMm("bovenstaaf rechts 44 mm binnen de lijfrand", boven[1].x, 556);
  checkTrue(
    "de bovenwapening blijft binnen het lijf",
    boven.every((s) => s.x >= 300 && s.x <= 600),
    boven.map((s) => s.x.toFixed(1)).join(", "),
  );

  for (const s of staven) {
    checkTrue(
      `staaf op x = ${s.x.toFixed(0)}, z = ${s.z.toFixed(0)} ligt geheel in het beton`,
      inPolygoon([s.cx, s.cy], m.omtrek) && afstandTotRand([s.cx, s.cy], m.omtrek) >= s.r - 1e-9,
    );
  }
}

// ══ 5. De halve korf ══════════════════════════════════════════════════════
//
// Wat de profielkiezer doet zolang `controleerKorf` de korf afkeurt: alleen
// het beton tekenen. Hier staat vast wat dat oplevert, én waarom het moet.
log("5. De halve korf — alleen de omtrek");
{
  const afgekeurd = korfVan(rechthoek(300, 500), {
    bottom: { count: 12, diameter_mm: 20 },
    top: { count: 2, diameter_mm: 12 },
  });
  const reden = controleerKorf(afgekeurd);
  checkTrue("controleerKorf weigert 12Ø20 in 300 mm", reden !== null, String(reden));

  // De reden dat de schakelaar bestaat, in twee vormen. Dit zijn geen wensen
  // maar de huidige uitkomst van `staafPosities` bij een korf die de controle
  // niet haalt — precies daarom gebruikt de profielkiezer de tekening in die
  // stand niet.
  //
  // (a) 12Ø20 in 300 mm: de staven worden netjes uitgesmeerd over een
  //     binnenmaat die te klein is, en overlappen elkaar dus. Op het scherm is
  //     dat een rij die er heel gewoon uitziet en die zo niet te vlechten is.
  {
    const html = teken(afgekeurd, { wapening: true });
    const m = meetlint(html, 300, 500);
    const onder = cirkelsVan(html)
      .map((c) => ({ x: m.xMm(c.cx), z: m.zMm(c.cy), d: m.lengteMm(c.r) * 2 }))
      .filter((s) => s.z < 250)
      .sort((a, b) => a.x - b.x);
    checkEq("alle twaalf staven worden wél getekend", onder.length, 12);
    const hoh = onder[1].x - onder[0].x;
    checkTrue(
      "en ze overlappen elkaar: hart-op-hart kleiner dan de diameter",
      hoh < onder[0].d,
      `h.o.h. ${hoh.toFixed(1)} mm bij Ø${onder[0].d}`,
    );
  }

  // (b) een dekking die groter is dan de halve breedte — één cijfer te veel in
  //     het dekkingsveld is zo getypt. Dan komen de staven buiten het beton te
  //     liggen, en dat is een tekening van iets wat niet bestaat.
  {
    const teDik = korfVan(rechthoek(300, 500), {
      cover_mm: 300,
      bottom: { count: 3, diameter_mm: 20 },
      top: { count: 2, diameter_mm: 12 },
    });
    checkTrue("controleerKorf weigert ook deze korf", controleerKorf(teDik) !== null);
    const html = teken(teDik, { wapening: true });
    const m = meetlint(html, 300, 500);
    const cirkels = cirkelsVan(html);
    const buiten = cirkels.filter(
      (c) => !inPolygoon([c.cx, c.cy], m.omtrek) || afstandTotRand([c.cx, c.cy], m.omtrek) < c.r,
    );
    checkTrue(
      "mét wapening zouden er staven buiten het beton staan",
      buiten.length > 0,
      `${buiten.length} van de ${cirkels.length}`,
    );
    checkEq("zonder wapening staat er geen enkele", cirkelsVan(teken(teDik, { wapening: false })).length, 0);
  }

  const html = teken(afgekeurd, { wapening: false });
  checkTrue("de tekening valt niet om: er is nog steeds een omtrek", omtrekVan(html).length === 4);
  checkEq("geen enkele staaf getekend", cirkelsVan(html).length, 0);
  checkEq("geen beugel getekend", beugelVan(html), null);

  const teksten = tekstenVan(html);
  checkTrue(
    "b en h blijven staan",
    teksten.includes("b 300") && teksten.includes("h 500"),
    teksten.join(" | "),
  );
  checkTrue(
    "geen d-maat zonder onderwapening",
    !teksten.some((t) => t.startsWith("d ")),
    teksten.join(" | "),
  );
  checkTrue(
    "geen rijlabels",
    !teksten.some((t) => t.includes("Ø")),
    teksten.join(" | "),
  );
  checkTrue(
    "geen dekking of beugelmaat in het onderschrift",
    !teksten.some((t) => t.includes("dekking") || t.includes("beugel")),
    teksten.join(" | "),
  );
  checkTrue(
    "het aria-label claimt geen wapening",
    ariaVan(html) === "Betondoorsnede 300 × 500 mm, wapening niet getekend",
    ariaVan(html),
  );

  // Een T zonder wapening houdt wél zijn h_f in het onderschrift: dat is een
  // maat van het beton en niet van de korf.
  const teeHtml = teken(korfVan(tee(1200, 450, 300, 120), {}), { wapening: false });
  checkTrue(
    "bij een T blijft h_f in het onderschrift staan",
    tekstenVan(teeHtml).some((t) => t.includes("h_f 120")),
    tekstenVan(teeHtml).join(" | "),
  );
  checkTrue(
    "en de dekking staat er niet bij",
    !tekstenVan(teeHtml).some((t) => t.includes("dekking")),
    tekstenVan(teeHtml).join(" | "),
  );
}

// ══ 6. De bestaande aanroepers blijven ongemoeid ══════════════════════════
//
// `wapening` staat standaard AAN. Het korfpaneel en het rapport geven de prop
// niet mee en horen dus precies te krijgen wat ze altijd kregen.
log("6. Zonder de prop tekent hij de korf, zoals altijd");
{
  const korf = korfVan(rechthoek(300, 500), {
    bottom: { count: 3, diameter_mm: 16 },
    top: { count: 2, diameter_mm: 12 },
  });
  const zonderProp = teken(korf);
  const metPropAan = teken(korf, { wapening: true });
  checkEq("zonder prop identiek aan wapening={true}", zonderProp, metPropAan);
  checkEq("en er staan vijf staven", cirkelsVan(zonderProp).length, 5);
}

// ── Uitslag ───────────────────────────────────────────────────────────────
log(`\n${failed === 0 ? "ALLE TESTS GESLAAGD" : "TESTS GEFAALD"} — ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
