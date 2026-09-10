// Het betonvenster onderin — van de zone-invoer tot de getekende trapjes.
//
// WAAROM DEZE TEST BESTAAT
// Een dekkingslijn is een ONTWERPGEREEDSCHAP: hij moet laten zien waar de
// wapening tekortschiet en waar zij ruimte heeft. Een test die alleen
// controleert DAT er een lijn getekend is, zegt daar niets over — vier staven
// op een hoop zijn ook vier cirkels, en een trapje op de verkeerde plaats is
// ook een trapje. Deze test meet daarom de LIGGING terug: uit de gerenderde
// SVG, in millimeters langs de staaf, en vergelijkt die met plaatsen die hier
// zelf zijn uitgerekend.
//
// De blokken:
//
//   [1] DE ZONES     — `zoneModel` spiegelt `ReinforcementZones` uit de
//                      rekenkern: welke korf op plaats x ligt (`cage_at_mm`),
//                      de keuze van de zone op een GRENS, splitsen en
//                      samenvoegen, en de vier regels van `validate` die de
//                      editor vóór de kern moet kunnen melden.
//   [2] DE LAGEN     — `dekkingLagen`: waar het tekort begint (met een
//                      handberekend snijpunt), waar de eindzones liggen, wat
//                      er op een SPRONG wordt afgelezen, en hoe de vier
//                      unity-checkbronnen tot één kleurbalk worden.
//   [3] DE TEKENING  — `AanzichtTekening` gerenderd met react-dom/server; de
//                      trapjes, het rode tekortvak en de KANT waarop een laan
//                      ligt worden uit de SVG teruggemeten. Die kant is geen
//                      smaak: positief moment trekt in deze app aan de
//                      ondervezel, dus de onderwapening hoort onder de staaf.
//   [4] DE ECHTE KERN — `concrete_dekkingslijn` en de scheurwijdte per snede
//                      via de toetsbrug-binary, op een staaf met een
//                      AFGEKORTE wapeningszone. Daar hoort een tekort te
//                      staan, en het hoort op de goede millimeters te staan.
//
// Blok [4] wordt LUID overgeslagen als de toetsbrug-binary ontbreekt; [1] t/m
// [3] draaien altijd.
//
// Uitvoeren: npx tsx test-dekkingsvenster.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=dekkingsvenster

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");

const AanzichtTekening = (await import("./src/components/beton/dekking/AanzichtTekening.tsx")).default;
const {
  eindzoneVakken, momentLaan, dwarskrachtLaan, puntBijX, tekortVakken,
  ucKlasse, ucVerloop, voegUcVakkenSamen,
} = await import("./src/components/beton/dekking/dekkingLagen.ts");
const {
  controleerZones, kiesZone, korfOpX, splitsOpX, standaardZonesUitKorf,
  voegSamenMetRechts, zonesZijnLeeg,
} = await import("./src/components/beton/dekking/zoneModel.ts");
const { haalScheurwijdteLijn, kiesSneden } =
  await import("./src/components/beton/dekking/scheurwijdteLijn.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { korvenUitStaven } = await import("./src/stores/checkStore.ts");
const { bouwDekkingslijnVerzoeken } = await import("./src/lib/betonDekkingslijnBuilder.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}

/** Vergelijking op millimeters langs de staaf. */
function checkMm(naam, gemeten, verwacht, tol = 1) {
  ok(naam, Number.isFinite(gemeten) && Math.abs(gemeten - verwacht) <= tol,
    `${Number.isFinite(gemeten) ? gemeten.toFixed(1) : gemeten} mm in plaats van ${verwacht} mm`);
}

// ── De terugrekening van beeldpunt naar millimeter ────────────────────────
//
// De marges worden hier OPNIEUW opgeschreven en niet uit de component
// geïmporteerd. Zou de test dezelfde constanten gebruiken als de tekening, dan
// toetst hij zichzelf: een verschoven marge zou dan in beide even hard
// meeschuiven en nergens opvallen.
const MARGE_LINKS = 8;
const MARGE_RECHTS = 14;
const BREEDTE = 1000;
const TEKEN_W = BREEDTE - MARGE_LINKS - MARGE_RECHTS;
const naarMm = (px, lengteMm) => ((px - MARGE_LINKS) / TEKEN_W) * lengteMm;

/** Alle `<tag ... />`-openingen met hun attributen, als objecten. */
function elementen(svg, tag) {
  const uit = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "g");
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    const are = /([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[1])) !== null) attrs[a[1]] = a[2];
    uit.push(attrs);
  }
  return uit;
}

/** De punten van een `<path d="M x y L x y …">` als [x, y]-paren. */
function padPunten(d) {
  return [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => [
    parseFloat(m[1]), parseFloat(m[2]),
  ]);
}

log("═".repeat(78));
log("HET BETONVENSTER — de zones, de lagen, de tekening en de rekenkern");
log("═".repeat(78));

// ═══════════════════════════════════════════════════════════════════════════
log("\n[1] De zones — de spiegel van ReinforcementZones");
// ═══════════════════════════════════════════════════════════════════════════

const L = 6000;
const KORF = {
  cover_mm: 30, stirrup_diameter_mm: 8,
  bottom: { count: 3, diameter_mm: 16 },
  top: { count: 2, diameter_mm: 12 },
  stirrup_spacing_mm: 200, stirrup_legs: 2,
};
const DOORSNEDE = {
  shape: "Rectangle", b_mm: 300, h_mm: 600, b_w_mm: null, h_f_mm: null, flange_at_bottom: false,
};
const REST = {
  betonklasse: "C30/37", staalsoort: "B500B", milieuklasse: "XC1",
  constructieklasse: null, aantalStroken: 50, staaltak: "Horizontal",
};
const langs = (side, count, x0, x1) => ({
  side, row: { count, diameter_mm: side === "Bottom" ? 16 : 12 },
  x_start_mm: x0, x_end_mm: x1, bar_shape: "Recht", casting_position: "Onderzijde",
});
/** Staffeling 3/5/3 met de bijgelegde staven van 1500 tot 4500 mm. */
const ZONES = {
  longitudinal: [
    langs("Bottom", 3, 0, 1500), langs("Bottom", 5, 1500, 4500),
    langs("Bottom", 3, 4500, L), langs("Top", 2, 0, L),
  ],
  stirrups: [
    { x_start_mm: 0, x_end_mm: 1000, spacing_mm: 100, legs: 2, diameter_mm: 8 },
    { x_start_mm: 1000, x_end_mm: 5000, spacing_mm: 200, legs: 2, diameter_mm: 8 },
    { x_start_mm: 5000, x_end_mm: L, spacing_mm: 100, legs: 2, diameter_mm: 8 },
  ],
};

{
  ok("lege lijsten heten leeg", zonesZijnLeeg({ longitudinal: [], stirrups: [] }) && zonesZijnLeeg(undefined));

  // `cage_at_mm`: de korf die op x geldt.
  ok("op x = 1000 mm liggen de 3 doorgaande staven",
    korfOpX(KORF, ZONES, 1000).bottom.count === 3, `${korfOpX(KORF, ZONES, 1000).bottom.count}`);
  ok("op x = 3000 mm liggen er 5",
    korfOpX(KORF, ZONES, 3000).bottom.count === 5, `${korfOpX(KORF, ZONES, 3000).bottom.count}`);
  // OP de grens hoort de zone die daar BEGINT — dezelfde regel als `kies_zone`.
  ok("op de grens x = 1500 mm geldt de zone die daar BEGINT (5 staven)",
    korfOpX(KORF, ZONES, 1500).bottom.count === 5, `${korfOpX(KORF, ZONES, 1500).bottom.count}`);
  ok("op x = L hoort nog bij de laatste zone",
    korfOpX(KORF, ZONES, L).bottom.count === 3);
  ok("de beugelvelden komen uit de beugelzone",
    korfOpX(KORF, ZONES, 500).stirrup_spacing_mm === 100 &&
      korfOpX(KORF, ZONES, 3000).stirrup_spacing_mm === 200);
  ok("de bovenwapening blijft die van haar eigen zone",
    korfOpX(KORF, ZONES, 3000).top.count === 2);
  ok("zonder zones komt de basiskorf ONVERANDERD terug",
    korfOpX(KORF, undefined, 3000) === KORF);

  // De volgorde in de lijst mag niet uitmaken.
  const omgekeerd = { ...ZONES, longitudinal: [...ZONES.longitudinal].reverse() };
  ok("de volgorde in de lijst doet niet ter zake",
    korfOpX(KORF, omgekeerd, 3000).bottom.count === 5);
  ok("kiesZone kiest het grootste begin",
    kiesZone([{ x_start_mm: 0, x_end_mm: 6000 }, { x_start_mm: 1500, x_end_mm: 4500 }], 3000).x_start_mm === 1500);

  // Splitsen en samenvoegen.
  const gesplitst = splitsOpX(ZONES, "langs", 1, 3000);
  ok("splitsen maakt van één zone er twee, aaneensluitend",
    gesplitst.longitudinal.length === 5 &&
      gesplitst.longitudinal[1].x_end_mm === 3000 &&
      gesplitst.longitudinal[2].x_start_mm === 3000);
  ok("de twee helften dragen dezelfde wapening — splitsen verandert de constructie niet",
    gesplitst.longitudinal[1].row.count === 5 && gesplitst.longitudinal[2].row.count === 5);
  ok("splitsen ÓP een grens doet niets", splitsOpX(ZONES, "langs", 1, 1500) === null);
  ok("splitsen buiten de zone doet niets", splitsOpX(ZONES, "langs", 1, 5000) === null);

  const samen = voegSamenMetRechts(ZONES, "langs", 0);
  ok("samenvoegen rekt de linkerzone op tot het einde van de rechter",
    samen.longitudinal.length === 3 && samen.longitudinal[0].x_end_mm === 4500);
  ok("en houdt de wapening van de LINKER zone",
    samen.longitudinal[0].row.count === 3);
  ok("samenvoegen over de zijden heen kan niet",
    voegSamenMetRechts(ZONES, "langs", 2) === null, "de bovenzone is geen buur van de laatste onderzone");

  // De startindeling verandert rekenkundig niets.
  const start = standaardZonesUitKorf(KORF, L);
  ok("de startindeling is één zone per zijde over de volle lengte",
    start.longitudinal.length === 2 && start.longitudinal.every((z) => z.x_start_mm === 0 && z.x_end_mm === L));
  ok("en zij levert op elke plaats DEZELFDE korf als de staaf al had",
    [0, 1234, L].every((x) => {
      const k = korfOpX(KORF, start, x);
      return k.bottom.count === KORF.bottom.count && k.top.count === KORF.top.count &&
        k.stirrup_spacing_mm === KORF.stirrup_spacing_mm;
    }));
  ok("een korf zonder volledige beugelopgave levert GEEN beugelzone",
    standaardZonesUitKorf({ ...KORF, stirrup_spacing_mm: undefined }, L).stirrups.length === 0);

  // De vier regels van `validate` die de editor moet kunnen melden.
  const geldig = (z) => controleerZones(z, KORF, DOORSNEDE, L, REST);
  ok("de staffeling zelf is in orde", geldig(ZONES) === null, geldig(ZONES) ?? "");
  ok("lege lijsten zijn in orde", geldig({ longitudinal: [], stirrups: [] }) === null);

  const metGat = {
    ...ZONES,
    longitudinal: [langs("Bottom", 3, 0, 1500), langs("Bottom", 5, 2000, L), langs("Top", 2, 0, L)],
  };
  ok("een GAT wordt gemeld en niet dichtgetrokken",
    (geldig(metGat) ?? "").includes("gat"), geldig(metGat) ?? "geen melding");

  const metOverlap = {
    ...ZONES,
    longitudinal: [langs("Bottom", 3, 0, 2000), langs("Bottom", 5, 1500, L), langs("Top", 2, 0, L)],
  };
  ok("een OVERLAP wordt gemeld",
    (geldig(metOverlap) ?? "").includes("overlappen"), geldig(metOverlap) ?? "geen melding");

  const buiten = {
    ...ZONES,
    longitudinal: [langs("Bottom", 3, 0, L + 500), langs("Top", 2, 0, L)],
  };
  ok("een zone buiten de staaf wordt gemeld",
    (geldig(buiten) ?? "").includes("buiten de staaf"), geldig(buiten) ?? "geen melding");

  const halveBeugel = {
    ...ZONES,
    stirrups: [{ x_start_mm: 0, x_end_mm: L, spacing_mm: 0, legs: 2, diameter_mm: 8 }],
  };
  ok("een halve beugelopgave wordt gemeld — anders zou de toets daar stilzwijgend uitgaan",
    (geldig(halveBeugel) ?? "").includes("onvolledig"), geldig(halveBeugel) ?? "geen melding");

  // 20Ø16 = 320 mm staal in een binnenmaat van 300 − 2·(30 + 8) = 224 mm.
  const teVeelStaven = {
    ...ZONES,
    longitudinal: [langs("Bottom", 20, 0, L), langs("Top", 2, 0, L)],
  };
  ok("een zone waarvan de korf niet in de doorsnede past, wordt met de PLAATS erbij gemeld",
    /x = \d+ mm/.test(geldig(teVeelStaven) ?? "") && (geldig(teVeelStaven) ?? "").includes("past niet"),
    geldig(teVeelStaven) ?? "geen melding");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] De lagen — tekort, eindzone, sprong en kleurbalk");
// ═══════════════════════════════════════════════════════════════════════════

// Een lijn met de hand: benodigd loopt van 0 tot 400, aanwezig is 250 met een
// SPRONG naar 400 op x = 500. De verwachte plaatsen zijn hier uitgerekend en
// niet uit de code overgenomen.
const P = (x, benodigd, aanwezig, eindzone = false) => ({
  xMm: x, benodigd, aanwezig, uc: aanwezig > 0 ? benodigd / aanwezig : null, eindzone,
});
const HANDLIJN = [
  P(0, 0, 250), P(250, 100, 250), P(500, 200, 250), P(750, 300, 250), P(1000, 400, 250),
];

{
  const vakken = tekortVakken(HANDLIJN);
  ok("er is precies één tekortvak", vakken.length === 1, JSON.stringify(vakken));
  // Tussen x = 500 (marge +50) en x = 750 (marge −50) kruisen de lijnen op de
  // helft: 500 + 0,5·250 = 625 mm.
  checkMm("het tekort begint op het handberekende snijpunt", vakken[0]?.x0Mm, 625);
  checkMm("en loopt door tot het einde van de lijn", vakken[0]?.x1Mm, 1000);

  const zonderTekort = HANDLIJN.map((p) => ({ ...p, aanwezig: 500, uc: p.benodigd / 500 }));
  ok("een lijn die overal dekt heeft geen tekortvak", tekortVakken(zonderTekort).length === 0);

  // In de eindzone geldt §9.2.1.4/§9.2.1.5 en niet de vrije dekkingslijn; daar
  // hoort geen rode vlek te komen, ook al is de weerstand er nul.
  const metEindzone = [
    P(0, 100, 0, true), P(250, 100, 125, true), P(500, 100, 250), P(1000, 100, 250),
  ];
  ok("een tekort BINNEN de eindzone telt niet mee", tekortVakken(metEindzone).length === 0,
    JSON.stringify(tekortVakken(metEindzone)));
  const ez = eindzoneVakken(metEindzone);
  ok("de eindzone zelf wordt wel aangewezen", ez.length === 1, JSON.stringify(ez));
  checkMm("en zij loopt van het staafeinde tot waar de kern haar laat ophouden", ez[0]?.x1Mm, 250);

  // Op een sprong staan twee punten met dezelfde x. De aanwijzer hoort de
  // ONGUNSTIGE kant te melden.
  const sprong = [P(400, 200, 400), P(500, 220, 400), P(500, 220, 250), P(600, 230, 250)];
  const opSprong = puntBijX(sprong, 500);
  ok("op een sprong wordt de ongunstige kant afgelezen",
    opSprong.aanwezig === 250, `aanwezig ${opSprong.aanwezig}`);

  // De kleurbalk: de HOOGSTE unity check per plaats, over de bronnen heen.
  const bronA = [P(0, 100, 200), P(1000, 100, 200)];            // UC 0,50
  const bronB = [P(0, 190, 200), P(1000, 190, 200)];            // UC 0,95
  const balk = ucVerloop([{ naam: "A", punten: bronA }, { naam: "B", punten: bronB }]);
  ok("de balk neemt de hoogste unity check", balk.length === 1 && Math.abs(balk[0].uc - 0.95) < 1e-9,
    JSON.stringify(balk));
  ok("en noemt de bron die hem levert", balk[0]?.bron === "B");
  ok("0,95 valt in de klasse 'waarschuwing'", ucKlasse(0.95) === "waarschuwing");
  ok("1,01 valt in de klasse 'onvoldoende'", ucKlasse(1.01) === "onvoldoende");
  ok("0,90 valt nog in 'ok' — dezelfde grens als het toetsingspaneel", ucKlasse(0.9) === "ok");

  const vier = [
    { x0Mm: 0, x1Mm: 100, uc: 0.2, bron: "A" },
    { x0Mm: 100, x1Mm: 200, uc: 0.5, bron: "B" },
    { x0Mm: 200, x1Mm: 300, uc: 1.4, bron: "C" },
    { x0Mm: 300, x1Mm: 400, uc: 1.1, bron: "D" },
  ];
  const gevoegd = voegUcVakkenSamen(vier);
  ok("vakken van dezelfde klasse worden samengevoegd", gevoegd.length === 2, JSON.stringify(gevoegd));
  ok("het samengevoegde vak draagt de HOOGSTE unity check, niet het gemiddelde",
    Math.abs(gevoegd[1].uc - 1.4) < 1e-9 && gevoegd[1].bron === "C");
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] De tekening — de trapjes op de goede millimeter");
// ═══════════════════════════════════════════════════════════════════════════

const LAAN_HAND = {
  titel: "Proeflaan",
  eenheid: "kN",
  benodigdLabel: "F_s",
  aanwezigLabel: "F_Rs",
  // Dezelfde handlijn als hierboven, met een SPRONG van 250 naar 400 op x = 500.
  punten: [
    P(0, 0, 250), P(250, 100, 250), P(500, 200, 250), P(500, 200, 400),
    P(750, 300, 400), P(1000, 400, 400),
  ],
  maatgevend: 5,
  richting: "omlaag",
  kleur: "#2563eb",
};

const tekenArgs = {
  lengteMm: 1000,
  hoogteMm: 600,
  opleggingen: [{ xMm: 0, type: "pinned" }, { xMm: 1000, type: "zRoller" }],
  bundels: [
    { zijde: "onder", xStartMm: 0, xEindMm: 1000, label: "3Ø16", lBdMm: 100 },
    { zijde: "onder", xStartMm: 250, xEindMm: 750, label: "2Ø16", lBdMm: 100 },
  ],
  beugels: [{ xStartMm: 0, xEindMm: 1000, spacingMm: 200, benen: 2, diameterMm: 8 }],
  zoneGrenzenMm: [0, 250, 750, 1000],
  lanenBoven: [],
  lanenOnder: [LAAN_HAND],
  ucVakken: [{ x0Mm: 0, x1Mm: 500, uc: 0.5, bron: "proef" }, { x0Mm: 500, x1Mm: 1000, uc: 1.2, bron: "proef" }],
  lagen: { moment: true, dwarskracht: true, scheurwijdte: true, uc: true },
  cursorXMm: 500,
  breedtePx: BREEDTE,
};

{
  const svg = renderToStaticMarkup(React.createElement(AanzichtTekening, tekenArgs));

  // ── De trapjes van de weerstandslijn ──────────────────────────────────
  const paden = elementen(svg, "path");
  const aanwezigPad = paden.find((p) => (p.class ?? "").includes("dek-aanwezig"));
  ok("de weerstandslijn is getekend", aanwezigPad !== undefined);
  const punten = padPunten(aanwezigPad?.d ?? "");
  ok("zij heeft evenveel knikpunten als de lijn punten heeft",
    punten.length === LAAN_HAND.punten.length, `${punten.length}`);

  // De sprong: twee opeenvolgende punten met dezelfde x en een andere y.
  const sprongen = punten
    .map((p, i) => (i > 0 && Math.abs(p[0] - punten[i - 1][0]) < 0.01 && Math.abs(p[1] - punten[i - 1][1]) > 0.5 ? p[0] : null))
    .filter((x) => x !== null);
  ok("er staat precies één sprong in de weerstandslijn", sprongen.length === 1, `${sprongen.length}`);
  checkMm("en hij staat op de zonegrens", naarMm(sprongen[0], 1000), 500);

  // ── De KANT waarop de waarde wordt uitgezet ───────────────────────────
  // Een laan met `richting: "omlaag"` zet een grotere waarde VERDER NAAR
  // BENEDEN uit. Zou dat omgekeerd zijn, dan stond de dekkingslijn andersom
  // dan de momentenlijn op het canvas.
  const yBij = (xMm, welke) => {
    const p = padPunten(paden.find((q) => (q.class ?? "").includes(welke))?.d ?? "");
    return p.filter((q) => Math.abs(naarMm(q[0], 1000) - xMm) < 1)[0]?.[1];
  };
  ok("een grotere benodigde kracht ligt verder van de staaf af",
    yBij(1000, "dek-benodigd") > yBij(0, "dek-benodigd"),
    `y(400 kN) = ${yBij(1000, "dek-benodigd")?.toFixed(1)}, y(0 kN) = ${yBij(0, "dek-benodigd")?.toFixed(1)}`);

  // ── Het rode tekortvak ────────────────────────────────────────────────
  // De proeflaan MET de sprong dekt overal: na x = 500 is de weerstand 400 kN
  // en de benodigde kracht loopt tot precies 400 kN. Er hoort dus geen rood
  // vak te staan — en dat is een echte bewering, want de sprong ligt midden in
  // het stuk waar de benodigde lijn het hardst stijgt.
  const tekortRects = elementen(svg, "rect").filter((r) => (r.class ?? "").includes("dek-tekort"));
  ok("de laan met de bijgelegde staven krijgt GEEN rood vak", tekortRects.length === 0,
    `${tekortRects.length}`);
  ok("en de afleiding zegt hetzelfde", tekortVakken(LAAN_HAND.punten).length === 0,
    JSON.stringify(tekortVakken(LAAN_HAND.punten)));

  // Nu dezelfde laan ZONDER de bijgelegde staven: dan hoort het rode vak op
  // het handberekende snijpunt van 625 mm te beginnen.
  const zonderBijleg = { ...LAAN_HAND, punten: HANDLIJN, maatgevend: 4 };
  const svg2 = renderToStaticMarkup(
    React.createElement(AanzichtTekening, { ...tekenArgs, lanenOnder: [zonderBijleg] }),
  );
  const rood = elementen(svg2, "rect").filter((r) => (r.class ?? "").includes("dek-tekort"));
  ok("zonder de bijgelegde staven verschijnt er één rood vak", rood.length === 1, `${rood.length}`);
  checkMm("het rode vak begint op het handberekende snijpunt",
    naarMm(parseFloat(rood[0]?.x), 1000), 625);
  checkMm("en het loopt tot het staafeinde",
    naarMm(parseFloat(rood[0]?.x) + parseFloat(rood[0]?.width), 1000), 1000);

  // ── De aanwijzer en de kleurbalk ──────────────────────────────────────
  const lijnen = elementen(svg, "line");
  const cursor = lijnen.filter((l) => (l.stroke ?? "").includes("--theme-accent"));
  ok("de aanwijzer is getekend", cursor.length >= 1);
  checkMm("en hij staat op de opgegeven snede", naarMm(parseFloat(cursor[0]?.x1), 1000), 500);

  const balkRects = elementen(svg, "rect").filter((r) => (r.fill ?? "").includes("danger") || (r.fill ?? "") === "#16a34a");
  ok("de kleurbalk kleurt het tweede stuk rood en het eerste groen",
    balkRects.length === 2 && balkRects[0].fill === "#16a34a" && (balkRects[1].fill ?? "").includes("danger"),
    balkRects.map((r) => r.fill).join(" | "));

  // ── De staaf zelf: bundels op eigen rijen, opleggingen, lengte ────────
  const teksten = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  ok("de twee bundels hebben elk hun eigen label",
    teksten.includes("3Ø16") && teksten.includes("2Ø16"), teksten.join(" | "));
  ok("de lengte staat erbij", teksten.some((t) => t.includes("L = 1,00 m")), teksten.join(" | "));
  ok("de beugelzone staat erbij", teksten.includes("Ø8-200"));
  ok("de twee bundels liggen op VERSCHILLENDE hoogtes",
    (() => {
      const bundelPaden = paden
        .filter((p) => (p.d ?? "").startsWith("M ") && !(p.class ?? ""))
        .map((p) => padPunten(p.d))
        .filter((q) => q.length === 4);
      const hoogtes = new Set(bundelPaden.map((q) => q[1][1].toFixed(2)));
      return bundelPaden.length === 2 && hoogtes.size === 2;
    })());
  ok("er zijn twee opleggingen getekend",
    elementen(svg, "polygon").length + elementen(svg, "circle").length >= 3);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[4] De echte rekenkern — een AFGEKORTE wapeningszone");
// ═══════════════════════════════════════════════════════════════════════════

if (!existsSync(TOETSBRUG)) {
  overgeslagen++;
  log(`  (overgeslagen: ${TOETSBRUG} ontbreekt — bouw hem met`);
  log(`   cargo build --release -p toetsbrug  vanuit src-tauri)`);
} else {
  const echteKern = (opdracht, inputs) => new Promise((res, rej) => {
    const kind = spawn(TOETSBRUG, [], { stdio: ["pipe", "pipe", "pipe"] });
    let uit = "", fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("error", rej);
    kind.on("close", () => {
      let j;
      try { j = JSON.parse(uit); } catch { return rej(new Error(`kern gaf geen JSON: ${uit || fout}`)); }
      if (j && j.fout) return rej(new Error(j.fout));
      res(j);
    });
    kind.stdin.end(JSON.stringify({ opdracht, inputs }));
  });

  // De staaf van blok [1], maar met de bijgelegde staven TE VER ingekort: een
  // doorgaande 2Ø16 met 5Ø16 alleen tussen 2500 en 3500 mm. Dan komt de
  // benodigde lijn buiten dat stuk boven de aanwezige uit, en dat is precies
  // wat het venster moet laten zien.
  const KORT_KORF = { ...KORF, bottom: { count: 2, diameter_mm: 16 } };
  const KORT_ZONES = {
    longitudinal: [
      langs("Bottom", 2, 0, 2500), langs("Bottom", 5, 2500, 3500),
      langs("Bottom", 2, 3500, L), langs("Top", 2, 0, L),
    ],
    stirrups: ZONES.stirrups,
  };
  const cfg = {
    betonKorf: KORT_KORF, betonStaalsoort: "B500B", betonMilieuklasse: "XC1",
    betonZones: KORT_ZONES,
  };
  const model = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "C30/37", profile: "300x600", checkConfig: cfg }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    plates: [],
    loadCases: [{ id: 1, name: "Blijvend", type: "dead" }, { id: 2, name: "Veranderlijk", type: "live" }],
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -12 },
      { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -8 },
    ],
    selfWeightEnabled: false,
    scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  };
  const COMBOS = [
    { id: 1, name: "UGT 6.10b", type: "uls", formula: "1,20·G + 1,50·Q", factors: new Map([[1, 1.2], [2, 1.5]]) },
    { id: 2, name: "BGT frequent", type: "sls", formula: "G + 0,5·Q", factors: new Map([[1, 1.0], [2, 0.5]]) },
  ];
  const perCase = solveAllCases(bouwMultiInput(model)).perCase;
  const resultaten = new Map(COMBOS.map((c) => [c.id, combineResults(c, perCase)]));
  const { verzoeken } = bouwDekkingslijnVerzoeken({
    nodes: model.nodes, beams: model.beams, combinations: COMBOS,
    combinationResults: resultaten, korven: korvenUitStaven(model.beams),
  });

  const antwoord = await echteKern("concrete_dekkingslijn", verzoeken[0]);
  const laanOnder = momentLaan(antwoord.onder, "#2563eb");
  const laanBoven = momentLaan(antwoord.boven, "#2563eb");
  const laanV = dwarskrachtLaan(antwoord.dwarskracht.punten, antwoord.dwarskracht.maatgevend, "#10b981");

  // De tekenconventie, aan de werkelijkheid getoetst: een vrij opgelegde
  // ligger onder neerwaartse belasting krijgt POSITIEF moment, en dat trekt
  // aan de ONDERvezel. De onderwapening moet dus werk hebben en de
  // bovenwapening niet — en de laan van de onderwapening ligt daarom ONDER de
  // staaf.
  ok("de onderwapening draagt de trek van het veldmoment",
    Math.max(...laanOnder.punten.map((p) => p.benodigd)) > 100,
    `max F_s = ${Math.max(...laanOnder.punten.map((p) => p.benodigd)).toFixed(0)} kN`);
  ok("de bovenwapening heeft nergens trek",
    Math.max(...laanBoven.punten.map((p) => p.benodigd)) < 1e-6);
  ok("en daarom ligt de onderlaan ONDER de staaf en de bovenlaan erboven",
    laanOnder.richting === "omlaag" && laanBoven.richting === "omhoog");

  // Het tekort: buiten het ingekorte stuk schiet de 2Ø16 tekort.
  const tekorten = tekortVakken(laanOnder.punten);
  ok("er zijn twee tekortvakken — links en rechts van de bijgelegde staven",
    tekorten.length === 2, JSON.stringify(tekorten.map((v) => `${v.x0Mm.toFixed(0)}…${v.x1Mm.toFixed(0)}`)));
  ok("ze liggen aan weerszijden van het midden",
    tekorten.length === 2 && tekorten[0].x1Mm < 3000 && tekorten[1].x0Mm > 3000);
  ok("het maatgevende punt van de kern ligt in een tekortvak",
    (() => {
      const i = antwoord.onder.maatgevend;
      if (i === undefined || i === null) return false;
      const x = antwoord.onder.punten[i].x_mm;
      return tekorten.some((v) => x >= v.x0Mm - 1 && x <= v.x1Mm + 1);
    })(),
    `maatgevend op x = ${antwoord.onder.punten[antwoord.onder.maatgevend]?.x_mm.toFixed(0)} mm, UC ${antwoord.uc_moment_max?.toFixed(2)}`);
  ok("en zijn unity check is groter dan 1", (antwoord.uc_moment_max ?? 0) > 1,
    `${antwoord.uc_moment_max?.toFixed(2)}`);

  // De weerstandslijn springt op de zonegrenzen, en de TEKENING zet die sprong
  // op dezelfde millimeter neer.
  const svg = renderToStaticMarkup(React.createElement(AanzichtTekening, {
    ...tekenArgs,
    lengteMm: L,
    zoneGrenzenMm: [0, 2500, 3500, L],
    lanenBoven: [laanBoven],
    lanenOnder: [laanOnder, laanV],
    ucVakken: voegUcVakkenSamen(ucVerloop([
      { naam: "momentendekking onder", punten: laanOnder.punten },
      { naam: "dwarskrachtdekking", punten: laanV.punten },
    ])),
    bundels: [...antwoord.onder.bundels, ...antwoord.boven.bundels].map((s) => ({
      zijde: s.side === "Bottom" ? "onder" : "boven",
      xStartMm: s.x_start_mm, xEindMm: s.x_end_mm,
      label: `${s.aantal}Ø${s.diameter_mm}`, lBdMm: s.l_bd_mm,
    })),
    cursorXMm: 2500,
  }));
  const roodEcht = elementen(svg, "rect").filter((r) => (r.class ?? "").includes("dek-tekort"));
  ok("de tekening zet twee rode vakken neer", roodEcht.length === 2, `${roodEcht.length}`);
  checkMm("het eerste rode vak begint waar de dekkingslijn dat zegt",
    naarMm(parseFloat(roodEcht[0]?.x), L), tekorten[0].x0Mm, 2);
  checkMm("en het tweede eindigt waar de dekkingslijn dat zegt",
    naarMm(parseFloat(roodEcht[1]?.x) + parseFloat(roodEcht[1]?.width), L), tekorten[1].x1Mm, 2);

  const rodeBalk = elementen(svg, "rect").filter((r) => (r.fill ?? "").includes("danger") && r.class === undefined);
  ok("de kleurbalk kleurt rood waar de dekking tekortschiet", rodeBalk.length >= 1, `${rodeBalk.length} rode vakken`);

  // ── De scheurwijdte per snede ─────────────────────────────────────────
  const sneden = kiesSneden(verzoeken[0].beam.sls_frequent_envelope, KORT_ZONES, L, 33);
  for (const grens of [2500, 3500]) {
    ok(`beide kanten van de zonegrens x = ${grens} mm worden bemonsterd`,
      sneden.some((x) => Math.abs(x - (grens - 1)) < 0.01) &&
        sneden.some((x) => Math.abs(x - (grens + 1)) < 0.01),
      `dichtstbij: ${sneden.filter((x) => Math.abs(x - grens) <= 2).join(", ")}`);
  }
  // De grens zelf mag er best bij zitten — hij is immers ook een station van de
  // omhullende — maar de lijn mag er niet van AFHANGEN: een snede die precies
  // op een grens ligt, wordt door de kern aan een van de twee vakken
  // toegewezen, en welke van de twee is niet iets om aan deze kant aan te
  // nemen. Wat vaststaat is dat er aan weerszijden een snede ligt, zodat de
  // sprong hoe dan ook in de lijn komt te staan.
  for (const grens of [2500, 3500]) {
    const rondom = sneden.filter((x) => Math.abs(x - grens) <= 1 + 1e-9);
    ok(`rond x = ${grens} mm liggen sneden aan beide kanten`,
      rondom.some((x) => x < grens) && rondom.some((x) => x > grens),
      rondom.join(", "));
  }

  const lijn = await haalScheurwijdteLijn(verzoeken[0].beam, KORT_ZONES, echteKern, 33);
  ok("de scheurwijdtelijn heeft op elke bemonsterde snede een w_k",
    lijn.punten.length === lijn.aantalSneden && lijn.toelichting.length === 0,
    `${lijn.punten.length} van ${lijn.aantalSneden}`);
  const wBij = (x) => lijn.punten.find((p) => Math.abs(p.xMm - x) < 0.01)?.benodigd;
  ok("w_k SPRINGT op de zonegrens — meer staal, smallere scheur",
    wBij(2499) > wBij(2501) + 0.05,
    `w(2499) = ${wBij(2499)?.toFixed(3)} mm, w(2501) = ${wBij(2501)?.toFixed(3)} mm`);
  ok("en springt terug aan de andere kant",
    wBij(3501) > wBij(3499) + 0.05,
    `w(3499) = ${wBij(3499)?.toFixed(3)} mm, w(3501) = ${wBij(3501)?.toFixed(3)} mm`);
  ok("w_max is overal dezelfde grens uit tabel 7.1N",
    new Set(lijn.punten.map((p) => p.aanwezig)).size === 1,
    `w_max = ${lijn.punten[0]?.aanwezig} mm`);

  // De vier lagen samen in één kleurbalk: de scheurwijdte doet mee.
  const balk = voegUcVakkenSamen(ucVerloop([
    { naam: "momentendekking onder", punten: laanOnder.punten },
    { naam: "dwarskrachtdekking", punten: laanV.punten },
    { naam: "scheurwijdte", punten: lijn.punten },
  ]));
  ok("de kleurbalk kent meer dan één klasse — hij onderscheidt dus iets",
    new Set(balk.map((v) => ucKlasse(v.uc))).size > 1,
    balk.map((v) => `${v.x0Mm.toFixed(0)}…${v.x1Mm.toFixed(0)}:${ucKlasse(v.uc)}`).join(" "));
  ok("en de balk beslaat de hele staaf zonder gaten",
    balk.length > 0 && balk[0].x0Mm < 1 && balk[balk.length - 1].x1Mm > L - 1 &&
      balk.every((v, i) => i === 0 || Math.abs(v.x0Mm - balk[i - 1].x1Mm) < 1e-6));
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n" + "─".repeat(78));
log(`${passed} geslaagd, ${failed} gefaald${overgeslagen ? `, ${overgeslagen} blok overgeslagen` : ""}`);
process.exit(failed === 0 ? 0 : 1);

// ── Regressie: de staaflengte in het venster is in mm, niet ×1000 ──────────
//
// Het venster berekende de lengte uit de UI-knopen met ×1000 — de gewoonte
// van de rekenkern (meters) toegepast op UI-coördinaten (mm). Gevolg: een
// staaf van 6 m was in het venster 6 000 000 mm lang, de standaardzones liepen
// tot 6 000 000 en de titel zei "L = 6.000,00 m". Deze test houdt de ene
// plek waar die lengte vandaan komt op de UI-conventie.
{
  const { staafLengteMm, standaardZonesUitKorf } = await import("./src/components/beton/dekking/zoneModel.ts");
  const { STANDAARD_KORF } = await import("./src/components/beton/wapeningskorf.ts");
  const L = staafLengteMm({ x: 0, z: 0 }, { x: 6000, z: 0 });
  const ok1 = Math.abs(L - 6000) < 1e-9;
  process.stdout.write(`  ${ok1 ? "✓" : "✗"} staaflengte uit UI-knopen (0,0)-(6000,0) is 6000 mm, niet 6 000 000: ${L}\n`);
  ok1 ? passed++ : failed++;
  const schuin = staafLengteMm({ x: 1000, z: 2000 }, { x: 4000, z: 6000 });
  const ok2 = Math.abs(schuin - 5000) < 1e-9;
  process.stdout.write(`  ${ok2 ? "✓" : "✗"} schuine staaf 3-4-5: ${schuin} mm\n`);
  ok2 ? passed++ : failed++;
  const zones = standaardZonesUitKorf(STANDAARD_KORF.korf, L);
  const eind = zones.stirrups[0]?.x_end_mm;
  const ok3 = eind === 6000;
  process.stdout.write(`  ${ok3 ? "✓" : "✗"} de standaard-beugelzone eindigt op de staaflengte: ${eind} mm\n`);
  ok3 ? passed++ : failed++;
}
