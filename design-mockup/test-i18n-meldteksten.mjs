// Meldingen en labels uit .ts-bestanden lopen via i18n (issue #33, aanvulling
// op #21).
//
// WAT HIER MISGING
//  In het Engels, Duits en Frans bleven op een aantal plekken Nederlandse
//  teksten staan, omdat ze niet uit de locales kwamen maar uit een
//  .ts-bestand: de naam van een verlopend profiel ("… (verlopend)", "Gelast I
//  …"), de keuzelijsten windgebied en terreincategorie, de gevallen, de tabel
//  en de tekeningen van de windgenerator bij een vrijstaand dak, de
//  modelcontrole bij plaatlasten, de koppen "Eindstijfheid hout …" in de boom,
//  "niet gebruikt" achter een combinatie, de startvormen en catalogusreeksen
//  van de profieleditor, de meldingen van de korf- en zonecontrole, de
//  meldingen en namen bij het transformeren van gaten en bouwstenen, en de
//  afleiding van de scheefstand in de tooltip. De Duitse hint "Drücken Sie
//  Entf um diese Last zu löschen" miste bovendien een komma.
//
// DE AANPAK
//  Waar de Nederlandse tekst ook buiten de interface gebruikt wordt (kern,
//  MCP-bundel, rapport, IFC, tests, bediening), draagt het .ts-bestand een
//  `VertaalbareTekst`: de Nederlandse `tekst` plus `sleutel` en `waarden`. De
//  component vertaalt. Waar de tekst alleen in de interface komt (startvormen),
//  geeft het .ts-bestand alleen de sleutel.
//
// WAT DEZE TEST VASTLEGT
//  [1] De Nederlandse vertaling van elke sleutel is LETTERLIJK de Nederlandse
//      tekst die het .ts-bestand ernaast schrijft — voor een breed scala aan
//      gegenereerde meldingen. Zo kunnen de twee niet uit elkaar lopen.
//  [2] Elke gebruikte sleutel bestaat in nl/en/de/fr, en en/de/fr zijn geen
//      Nederlands gebleven.
//  [3] Steekproeven in en/de/fr via i18next, waaronder de Duitse komma.
//  [4] De componenten gebruiken de vertaalbare vorm (bronscan).
//
// Uitvoeren: npx tsx test-i18n-meldteksten.mjs   (vanuit design-mockup/)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const SRC = join(HIER, "src");
const LOCALES = join(SRC, "i18n", "locales");
const TALEN = ["nl", "en", "de", "fr"];

const { zetTaal, default: i18next } = await import("./scripts/i18n-voor-tests.mjs");
const { vertaal, vertaalWaarde, nederlands, isVertaalbareTekst } = await import("./src/lib/vertaalbareTekst.ts");
const { bepaalPlaatlastRand } = await import("./src/components/fem/femTypes.ts");
const { zoekPlaatlastFouten } = await import("./src/lib/modelControle.ts");
const { doorsnedeNaam, doorsnedeNaamTekst, profielNaamTekst } = await import("./src/lib/verloopKeuze.ts");
const { windGevalNaam, windGevalTab } = await import("./src/lib/wind/windGevalLabel.ts");
const { genereerWindbelasting, STANDAARD_WIND_INSTELLINGEN } = await import("./src/lib/wind/windGenerator.ts");
const { WINDGEBIEDEN, TERREIN_CATEGORIEEN } = await import("./src/lib/wind/windEurocode.ts");
const { LABEL_ZUIVER_STAAL, LABEL_ZUIVER_STAAL_TEKST } = await import("./src/lib/combinatieSelectie.ts");
const { REEKSEN, reeksLabel } = await import("./src/lib/profieleditor/catalogus.ts");
const { PRESETS } = await import("./src/lib/profieleditor/presets.ts");
const tr = await import("./src/lib/profieleditor/transformeren.ts");
const { STANDAARD_KORF, controleerKorf, controleerKorfMelding, rechthoek } =
  await import("./src/components/beton/wapeningskorf.ts");
const { controleerZones, controleerZonesMelding } = await import("./src/components/beton/dekking/zoneModel.ts");
const sch = await import("./src/lib/scheefstandNorm.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

const cache = {};
const leesNs = (taal, ns) =>
  (cache[`${taal}/${ns}`] ??= JSON.parse(readFileSync(join(LOCALES, taal, `${ns}.json`), "utf8")));
/** "common:wind.case.cpnet" → de tekst in `taal`; bij meervoud de `_other`-vorm. */
function tekst(taal, sleutel) {
  const [ns, pad] = sleutel.split(":");
  const delen = pad.split(".");
  let o = leesNs(taal, ns);
  for (const d of delen.slice(0, -1)) o = o?.[d];
  const laatste = delen.at(-1);
  const w = o?.[laatste] ?? o?.[`${laatste}_other`];
  return typeof w === "string" ? w : undefined;
}

// ── Verzamelen: elke vertaalbare tekst, met alle geneste sleutels ─────────
const sleutels = new Set();
const monsters = [];   // [herkomst, VertaalbareTekst]
function neemWaarde(w) {
  if (isVertaalbareTekst(w)) {
    sleutels.add(w.sleutel);
    for (const x of Object.values(w.waarden ?? {})) neemWaarde(x);
  } else if (w && typeof w === "object" && Array.isArray(w.lijst)) {
    for (const x of w.lijst) neemWaarde(x);
  }
}
function neem(herkomst, v) {
  if (!v) return;
  neemWaarde(v);
  if (isVertaalbareTekst(v) || (typeof v === "object" && Array.isArray(v.lijst))) monsters.push([herkomst, v]);
}

// Verlopend profiel.
for (const b of [
  { material: "S235", profile: "IPE 300" },
  { material: "S235", profile: "IPE 300", profileEnd: "IPE 200" },
  { material: "S235", profile: "IPE 300", profileEnd: "SHS 100x100x5" },
  { material: "S235", profile: "EIGEN:Gelast I 385×180×8,4×13,5", profileEnd: "IPE 500" },
]) {
  const w = doorsnedeNaamTekst(b);
  check(`doorsnedeNaam "${doorsnedeNaam(b)}" = de Nederlandse vorm van doorsnedeNaamTekst`,
    doorsnedeNaam(b) === nederlands(w));
  if (typeof w !== "string") neem("doorsnedeNaamTekst", w);
}
neem("profielNaamTekst", profielNaamTekst("Gelast I 385×180×8,4×13,5"));
check("verlopend: de naam draagt '(verlopend)'",
  /\(verlopend\)$/.test(doorsnedeNaam({ material: "S235", profile: "IPE 300", profileEnd: "IPE 200" })));

// Windgenerator: alle gevallen van gebouw, lessenaarsdak en zadeldak.
const portaal = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 0, z: 3000 }, { id: 4, x: 6000, z: 3000 - 6000 * Math.tan(Math.PI / 18) }],
  beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 }],
  loadCases: [{ id: 1, name: "Eigen gewicht", type: "dead" }],
};
const zadel = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 8000, z: 0 }, { id: 3, x: 0, z: 2500 },
    { id: 4, x: 4000, z: 2500 + 4000 * Math.tan(Math.PI / 12) }, { id: 5, x: 8000, z: 2500 }],
  beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 5 }, { id: 3, from: 3, to: 4 }, { id: 4, from: 4, to: 5 }],
  loadCases: [{ id: 1, name: "Eigen gewicht", type: "dead" }],
};
const portaalPlat = {
  ...portaal,
  nodes: portaal.nodes.map((n) => (n.id === 4 ? { ...n, z: 3000 } : n)),
};
const windGevallen = [];
for (const [model, inst] of [
  [portaalPlat, { ...STANDAARD_WIND_INSTELLINGEN, richtingHaaks: true }],
  [portaalPlat, { ...STANDAARD_WIND_INSTELLINGEN, cpiKeuze: "handmatig", cpiHandmatig: -0.3 }],
  [portaal, { ...STANDAARD_WIND_INSTELLINGEN, vorm: "vrijstaandDak", vrijstaandDakvorm: "lessenaar", wrijving: "glad" }],
  [portaal, { ...STANDAARD_WIND_INSTELLINGEN, vorm: "vrijstaandDak", vrijstaandDakvorm: "lessenaar", kolomDoorsnede: "rechthoekig" }],
  [zadel, { ...STANDAARD_WIND_INSTELLINGEN, vorm: "vrijstaandDak", vrijstaandDakvorm: "zadel", wrijving: "ruw", kolomDoorsnede: "scherphoekig" }],
]) {
  const res = genereerWindbelasting(model, inst);
  const dakvorm = res.samenvatting?.vrijstaand?.dakvorm ?? null;
  for (const gv of res.samenvatting?.perGeval ?? []) windGevallen.push({ gv, dakvorm });
}
check(`windgenerator: ${windGevallen.length} gevallen verzameld (gebouw, lessenaar, zadel, horizontaal)`,
  windGevallen.length >= 20 && windGevallen.some((g) => g.gv.sleutel.includes("horizontaal"))
  && windGevallen.some((g) => g.gv.sleutel.startsWith("wind:")) && windGevallen.some((g) => g.gv.sleutel.endsWith(":beide")),
  windGevallen.map((g) => g.gv.sleutel).join(", "));
const onbekend = windGevallen.filter(({ gv, dakvorm }) => !windGevalNaam(gv, dakvorm));
check("windgenerator: elk geval heeft een vertaalbare naam", onbekend.length === 0,
  onbekend.map((g) => g.gv.sleutel).join(", "));
for (const { gv, dakvorm } of windGevallen) {
  const naam = windGevalNaam(gv, dakvorm);
  const tab = windGevalTab(gv, dakvorm);
  if (!naam || !tab) continue;
  check(`wind "${gv.naam}": Nederlandse vorm = naam van de generator`, naam.tekst === gv.naam, naam.tekst);
  const oudTab = gv.sleutel.startsWith("luifel:")
    ? gv.naam.replace("Wind vrijstaand dak ", "")
    : gv.naam.replace("Wind ", "").replace("wind ", "");
  check(`wind "${gv.naam}": tab = het oude tablabel`, tab.tekst === oudTab, tab.tekst);
  neem("windGevalNaam", naam);
}

// Plaatlasten: elke weigering van bepaalPlaatlastRand.
const vierkant = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }, { x: 0, z: 1000 }];
const kruis = [{ x: 0, z: 0 }, { x: 1000, z: 1000 }, { x: 1000, z: 0 }, { x: 0, z: 1000 }];
const vijfhoek = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1200, z: 600 }, { x: 500, z: 1000 }, { x: 0, z: 800 }];
const opening = [{ id: 7, punten: [{ x: 300, z: 300 }, { x: 600, z: 300 }, { x: 600, z: 600 }] }];
const dubbel = [{ id: 7, punten: opening[0].punten }, { id: 7, punten: opening[0].punten }];
const plat = [{ id: 8, punten: [{ x: 300, z: 300 }, { x: 300, z: 300 }, { x: 600, z: 600 }] }];
const redenen = [];
for (const [punten, openingen, adres] of [
  [vierkant, undefined, { edge: "bottom", edgeIndex: 0 }],
  [vierkant, undefined, {}],
  [[{ x: 0, z: 0 }, { x: 1, z: 0 }], undefined, { edgeIndex: 0 }],
  [vierkant, undefined, { edgeIndex: 9 }],
  [kruis, undefined, { edgeIndex: 0 }],
  [vierkant, undefined, { edge: "midden" }],
  [vijfhoek, undefined, { edge: "top" }],
  [vierkant, opening, { openingId: 7, edge: "top" }],
  [vierkant, opening, { openingId: 1.5, edgeIndex: 0 }],
  [vierkant, undefined, { openingId: 7, edgeIndex: 0 }],
  [vierkant, opening, { openingId: 9, edgeIndex: 0 }],
  [vierkant, dubbel, { openingId: 7, edgeIndex: 0 }],
  [vierkant, [{ id: 7, punten: opening[0].punten.slice(0, 2) }], { openingId: 7, edgeIndex: 0 }],
  [vierkant, opening, { openingId: 7 }],
  [vierkant, opening, { openingId: 7, edgeIndex: 5 }],
  [vierkant, plat, { openingId: 8, edgeIndex: 0 }],
]) {
  const r = bepaalPlaatlastRand(punten, openingen, adres);
  if (r.ok) { check(`plaatrand ${JSON.stringify(adres)} wordt geweigerd`, false); continue; }
  check(`plaatrand: reden = redenTekst.tekst (${r.redenTekst.sleutel.split(".").at(-1)})`, r.reden === r.redenTekst.tekst);
  redenen.push(r.redenTekst.sleutel);
  neem("bepaalPlaatlastRand", r.redenTekst);
}
check("plaatrand: 16 verschillende weigeringen", new Set(redenen).size === 16, [...new Set(redenen)].join(", "));

// Modelcontrole bij plaatlasten.
const plaatModel = {
  nodes: vierkant.map((p, i) => ({ id: i + 1, ...p })),
  beams: [],
  plates: [{ id: 1, nodeIds: [1, 2, 3, 4] }],
  loads: [
    { id: 9, type: "edgeLoad", plateId: 1, openingId: 1, edgeIndex: 0, caseId: 1 },
    { id: 10, type: "pointForce", plateId: 1, edgeIndex: 0, caseId: 1 },
    { id: 11, type: "edgeLoad", plateId: 5, edgeIndex: 0, caseId: 1 },
  ],
};
const bev = zoekPlaatlastFouten(plaatModel);
check("modelcontrole: drie plaatlastfouten", bev.length === 3, bev.map((b) => b.tekst).join(" | "));
for (const b of bev) {
  check(`modelcontrole: tekst = tekstVertaalbaar.tekst ("${b.tekst.slice(0, 40)}…")`, b.tekst === b.tekstVertaalbaar?.tekst);
  neem("zoekPlaatlastFouten", b.tekstVertaalbaar);
}
check("modelcontrole: de melding uit het issue",
  bev.some((b) => b.tekst === "Randlast 9 op plaat 1: de last staat op opening 1, maar deze plaat heeft geen openingen."));

// Combinatie "niet gebruikt".
check("LABEL_ZUIVER_STAAL_TEKST draagt dezelfde Nederlandse tekst", LABEL_ZUIVER_STAAL_TEKST.tekst === LABEL_ZUIVER_STAAL);
neem("LABEL_ZUIVER_STAAL_TEKST", LABEL_ZUIVER_STAAL_TEKST);

// Catalogusreeksen.
for (const r of REEKSEN) {
  const w = reeksLabel(r);
  check(`reeks ${r.id}: Nederlandse vorm = label "${r.label}"`, nederlands(w) === r.label);
  if (typeof w !== "string") neem("reeksLabel", w);
}

// Transformeren.
const IPE300 = { naam: "IPE 300", soort: "ISection", h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15 };
const gatOntwerp = {
  soort: "gat", basis: IPE300,
  gaten: [
    { id: "g1", plaats: "lijf", vorm: "rond", y: 75, z: 150, d: 80, b: 0, h: 0, hoekGraden: 0 },
    { id: "g2", plaats: "flensBoven", vorm: "rond", y: 40, z: 295, d: 20, b: 0, h: 0, hoekGraden: 0 },
    { id: "g3", plaats: "vlak", vorm: "rond", y: 75, z: 60, d: 20, b: 0, h: 0, hoekGraden: 20 },
    { id: "g4", plaats: "wand", vorm: "rond", y: 0, z: 0, d: 12, b: 0, h: 0, hoekGraden: 30 },
    { id: "g5", plaats: "flensOnder", vorm: "rond", y: 40, z: 5, d: 20, b: 0, h: 0, hoekGraden: 0 },
  ],
};
for (const b of [tr.verplaatsGaten(gatOntwerp, null, 5, 5), tr.roteerGaten(gatOntwerp, null, 10), tr.spiegelGaten(gatOntwerp, null)]) {
  check(`transformeren: melding = de teksten samengevoegd ("${(b.melding ?? "").slice(0, 30)}…")`,
    b.melding === b.meldingTeksten.map((m) => m.tekst).join(" ") && b.meldingTeksten.length > 0);
  for (const m of b.meldingTeksten) neem("gatbewerking", m);
}
for (const g of gatOntwerp.gaten) {
  const v = tr.naamVanGatTekst(gatOntwerp, g.id);
  check(`naamVanGat ${g.id} = Nederlandse vorm`, tr.naamVanGat(gatOntwerp, g.id) === v.tekst);
  neem("naamVanGatTekst", v);
}
const samenstelling = {
  soort: "samenstelling", celMeenemen: false,
  lamellen: [{ id: "l1", b_mm: 200, t_mm: 20, y_mm: 0, z_mm: 190, alphaGraden: 0 }],
  catalogusdelen: [{ id: "d1", profiel: { naam: "HEA 200", soort: "ISection", h: 190, b: 200, tw: 6.5, tf: 10, r: 18 }, y_mm: 40, z_mm: 0, alphaGraden: 0, gespiegeld: false }],
};
for (const id of ["l1", "d1"]) {
  const v = tr.naamVanBouwsteenTekst(samenstelling, id);
  check(`naamVanBouwsteen ${id} = Nederlandse vorm`, tr.naamVanBouwsteen(samenstelling, id) === v.tekst);
  neem("naamVanBouwsteenTekst", v);
}

// Korfcontrole.
const K = STANDAARD_KORF;
const tee = { ...rechthoek(600, 500), shape: "Tee", b_w_mm: 250, h_f_mm: 120 };
const korven = [
  { ...K, doorsnede: rechthoek(0, 500) },
  { ...K, doorsnede: { ...tee, b_w_mm: null } },
  { ...K, doorsnede: { ...tee, h_f_mm: 0 } },
  { ...K, doorsnede: { ...tee, b_w_mm: 700 } },
  { ...K, doorsnede: { ...tee, h_f_mm: 600 } },
  { ...K, korf: { ...K.korf, cover_mm: -1 } },
  { ...K, korf: { ...K.korf, cover_top: { cover_mm: -5 } } },
  { ...K, korf: { ...K.korf, top: { count: 0, diameter_mm: 0 }, bottom: { count: 0, diameter_mm: 0 } } },
  { ...K, korf: { ...K.korf, top: { count: 0, diameter_mm: 0 }, bottom: { count: 0, diameter_mm: 0 }, sides: { count: 2, diameter_mm: 12 } } },
  { ...K, korf: { ...K.korf, sides: { count: 2, diameter_mm: 0 } } },
  { ...K, korf: { ...K.korf, bottom: { count: 12, diameter_mm: 25 } } },
  { ...K, doorsnede: tee, korf: { ...K.korf, bottom: { count: 12, diameter_mm: 25 } } },
  { ...K, doorsnede: rechthoek(300, 60) },
  { ...K, doorsnede: rechthoek(110, 500), korf: { ...K.korf, top: { count: 1, diameter_mm: 10 }, bottom: { count: 1, diameter_mm: 10 }, sides: { count: 2, diameter_mm: 20 } } },
  { ...K, korf: { ...K.korf, sides: { count: 30, diameter_mm: 20 } } },
  { ...K, korf: { ...K.korf, stirrup_spacing_mm: 0 } },
  { ...K, korf: { ...K.korf, stirrup_leg_spacing_mm: 0 } },
  { ...K, korf: { ...K.korf, stirrup_fywk_mpa: 0 } },
  { ...K, korf: { ...K.korf, stirrup_legs: 0 } },
  { ...K, korf: { ...K.korf, stirrup_diameter_mm: 0, stirrup_spacing_mm: 150 } },
  { ...K, korf: { ...K.korf, stirrup_leg_spacing_mm: 900 } },
];
const korfSleutels = new Set();
for (const k of korven) {
  const m = controleerKorfMelding(k);
  if (!m) { check(`korfcontrole weigert ${JSON.stringify(k.korf).slice(0, 60)}`, false); continue; }
  check(`korfcontrole: controleerKorf = melding.tekst (${m.sleutel.split(".").at(-1)})`, controleerKorf(k) === m.tekst);
  korfSleutels.add(m.sleutel);
  neem("controleerKorfMelding", m);
}
check(`korfcontrole: ${korfSleutels.size} verschillende meldingen (≥ 20)`, korfSleutels.size >= 20, [...korfSleutels].join(", "));

// Zonecontrole.
const L = 6000;
const REST = { betonklasse: K.betonklasse, staalsoort: K.staalsoort, milieuklasse: null, constructieklasse: null, aantalStroken: K.aantalStroken, staaltak: K.staaltak };
const langs = (side, count, x0, x1, d = 16) => ({ side, row: { count, diameter_mm: d }, x_start_mm: x0, x_end_mm: x1 });
const beugel = (x0, x1, s = 150) => ({ x_start_mm: x0, x_end_mm: x1, diameter_mm: 8, spacing_mm: s, legs: 2 });
const basisZones = { longitudinal: [langs("Bottom", 3, 0, L), langs("Top", 2, 0, L, 12)], stirrups: [beugel(0, L)] };
const zoneGevallen = [
  [basisZones, 0],
  [{ ...basisZones, longitudinal: [langs("Bottom", 3, 0, NaN), langs("Top", 2, 0, L, 12)] }, L],
  [{ ...basisZones, longitudinal: [langs("Bottom", 0, 3000, 1000), langs("Top", 2, 0, L, 12)] }, L],
  [{ ...basisZones, longitudinal: [langs("Bottom", 3, 0, L + 500), langs("Top", 2, 0, L, 12)] }, L],
  [{ ...basisZones, stirrups: [beugel(0, L + 500)] }, L],
  [{ ...basisZones, stirrups: [beugel(0, L, 0)] }, L],
  [{ ...basisZones, longitudinal: [langs("Bottom", 3, 100, L), langs("Top", 2, 0, L, 12)] }, L],
  [{ ...basisZones, longitudinal: [langs("Bottom", 3, 0, 2000), langs("Bottom", 5, 2500, L), langs("Top", 2, 0, L, 12)] }, L],
  [{ ...basisZones, longitudinal: [langs("Bottom", 3, 0, 3000), langs("Bottom", 5, 2500, L), langs("Top", 2, 0, L, 12)] }, L],
  [{ ...basisZones, longitudinal: [langs("Bottom", 3, 0, L), langs("Top", 2, 0, 5000, 12)] }, L],
  [{ ...basisZones, stirrups: [beugel(0, 3000), beugel(3500, L)] }, L],
  [{ ...basisZones, longitudinal: [langs("Bottom", 3, 0, 3000), langs("Bottom", 14, 3000, L, 25), langs("Top", 2, 0, L, 12)] }, L],
];
const zoneSleutels = new Set();
for (const [zones, lengte] of zoneGevallen) {
  const m = controleerZonesMelding(zones, K.korf, K.doorsnede, lengte, REST);
  if (!m) { check(`zonecontrole weigert geval ${zoneSleutels.size + 1}`, false); continue; }
  check(`zonecontrole: controleerZones = melding.tekst (${m.sleutel.split(".").at(-1)})`,
    controleerZones(zones, K.korf, K.doorsnede, lengte, REST) === m.tekst);
  zoneSleutels.add(m.sleutel);
  neem("controleerZonesMelding", m);
}
check(`zonecontrole: ${zoneSleutels.size} verschillende meldingen (≥ 9)`, zoneSleutels.size >= 9, [...zoneSleutels].join(", "));

// Scheefstand.
const staal = { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" };
const beton = { id: 2, from: 2, to: 3, material: "C30/37", profile: "300x500" };
const hout = { id: 3, from: 3, to: 4, material: "C24", profile: "100x200" };
const tweeLaags = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }, { id: 3, x: 0, z: 6000 }, { id: 4, x: 6000, z: 0 }, { id: 5, x: 6000, z: 3000 }, { id: 6, x: 6000, z: 6000 }],
  beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 2, to: 3 }, { id: 3, from: 4, to: 5 }, { id: 4, from: 5, to: 6 }, { id: 5, from: 3, to: 6 }],
  supports: [{ nodeId: 1 }, { nodeId: 4 }],
};
const eenKolom = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 30000 }], beams: [{ id: 1, from: 1, to: 2 }], supports: [] };
const vlak = { nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }], beams: [{ id: 1, from: 1, to: 2 }], supports: [{ nodeId: 1 }] };
const scheefGevallen = [];
for (const [model, keuze, beams] of [
  [tweeLaags, { bron: "vast", noemer: 200 }, [staal]],
  [tweeLaags, { bron: "en1993", noemer: 200 }, [staal]],
  [tweeLaags, { bron: "en1992", noemer: 200, hoogteM: 2, aantalElementen: 3 }, [beton]],
  [eenKolom, { bron: "en1995", noemer: 200 }, [hout]],
  [vlak, { bron: "en1995", noemer: 200 }, [hout]],
  [vlak, { bron: "en1993", noemer: 200 }, [hout]],
  [tweeLaags, { bron: "ongunstigste", noemer: 200 }, [staal, beton, hout]],
  [tweeLaags, { bron: "ongunstigste", noemer: 250 }, []],
  [eenKolom, { bron: "en1993", noemer: 200 }, [staal]],
]) {
  const g = sch.leidScheefstandGeometrieAf(model);
  const u = sch.bepaalScheefstand(keuze, g, sch.toepasselijkeScheefstandNormen(beams));
  scheefGevallen.push([g, u]);
  check(`scheefstand ${keuze.bron}: afleiding = Nederlandse teksten`,
    JSON.stringify(g.afleiding) === JSON.stringify(g.afleidingTeksten.map((t) => t.tekst)));
  check(`scheefstand ${keuze.bron}: waarschuwingen = Nederlandse teksten`,
    JSON.stringify(u.waarschuwingen) === JSON.stringify(u.waarschuwingTeksten.map((t) => t.tekst)));
  check(`scheefstand ${keuze.bron}: regels = Nederlandse teksten`,
    u.regels.every((r) => r.uitleg === r.uitlegTekst.tekst && r.artikel === nederlands(r.artikelTekst)));
  for (const t of [...g.afleidingTeksten, ...u.waarschuwingTeksten, ...u.regels.flatMap((r) => [r.uitlegTekst, r.artikelTekst])]) neem("scheefstand", t);
}
check("scheefstand: alle waarschuwingssoorten gezien",
  ["notDerivable", "noHeight", "noNormApplies", "normWithoutMaterial", "governing"].every((w) =>
    scheefGevallen.some(([, u]) => u.waarschuwingTeksten.some((t) => t.sleutel.endsWith(`warn.${w}`)))),
  [...new Set(scheefGevallen.flatMap(([, u]) => u.waarschuwingTeksten.map((t) => t.sleutel)))].join(", "));

// ── [1] Nederlandse vertaling = Nederlandse tekst ─────────────────────────
log("\n[1] De Nederlandse vertaling van elke sleutel is de Nederlandse tekst van het .ts-bestand");
await zetTaal("nl");
const tNl = i18next.getFixedT("nl", "common");
const afwijkend = monsters.filter(([, v]) => vertaalWaarde(tNl, v) !== nederlands(v));
check(`${monsters.length} meldingen: nl-vertaling letterlijk gelijk`, afwijkend.length === 0,
  afwijkend.slice(0, 3).map(([h, v]) => `${h}: "${vertaalWaarde(tNl, v)}" ≠ "${nederlands(v)}"`).join(" | "));
for (const [g, u] of scheefGevallen) {
  check(`scheefstand ${u.bron}: vertaalde toelichting (nl) = scheefstandToelichting`,
    sch.scheefstandToelichtingVertaald(u, g, tNl) === sch.scheefstandToelichting(u, g));
}
for (const g of Object.keys(WINDGEBIEDEN)) {
  const s = `common:wind.regionOption.${g}`; sleutels.add(s);
  check(`windgebied ${g}: nl = omschrijving`, tNl(s) === WINDGEBIEDEN[g].omschrijving, tNl(s));
}
sleutels.add("common:wind.regionSource");
check("windgebied: bron nl = bron van elk gebied",
  Object.values(WINDGEBIEDEN).every((g) => g.bron === tNl("common:wind.regionSource")), tNl("common:wind.regionSource"));
for (const c of Object.keys(TERREIN_CATEGORIEEN)) {
  const s = `common:wind.terrainOption.${c}`; sleutels.add(s);
  check(`terreincategorie ${c}: nl = omschrijving`, tNl(s) === TERREIN_CATEGORIEEN[c].omschrijving, tNl(s));
}
const OUDE_PRESETS = {
  "gelaste-i": ["Gelaste I", "Flenzen 200×15, lijf 400×10 (h = 430)"],
  koker: ["Koker", "Vier platen, 200×200, wanden 10 — gesloten cel (Bredt)"],
  t: ["T-profiel", "Flens 200×20 op een lijf 180×10"],
  hoek: ["Hoek L", "Hoekprofiel 100×100×10, scherpe hoek"],
  sfb: ["SFB-ligger", "Geïntegreerde ligger: HEB 200 met onderplaat 400×15 — de vloer rust op de plaatranden"],
  "dubbel-unp": ["2× UNP 200", "Twee UNP 200 rug aan rug — catalogusdelen, gespiegeld om de z-as"],
};
for (const p of PRESETS) {
  sleutels.add(p.labelSleutel); sleutels.add(p.omschrijvingSleutel);
  check(`startvorm ${p.id}: nl = de oude tekst`,
    tNl(p.labelSleutel) === OUDE_PRESETS[p.id]?.[0] && tNl(p.omschrijvingSleutel) === OUDE_PRESETS[p.id]?.[1]);
}
const hout3 = readFileSync(join(SRC, "lib", "houtEindstijfheid.ts"), "utf8");
for (const [c, s] of [["KOP_NIET_DOORGEREKEND", "notCalculated"], ["KOP_DOORGEREKEND_UGT", "calculatedUls"], ["KOP_DOORGEREKEND_BGT", "calculatedSls"]]) {
  const sleutel = `common:tree.timberFinalStiffness.${s}`; sleutels.add(sleutel);
  const nl = tNl(sleutel);
  const aantalMeldingen = (hout3.match(new RegExp(`kop: ${c},\\s*\\n\\s*tekst:\\s*\\n\\s*["\`]${nl.replace(/[()]/g, "\\$&")}\\. `, "g")) ?? []).length;
  check(`hout: kop ${c} is de eerste zin van ${s === "notCalculated" ? "twee meldingen" : "zijn melding"}`,
    aantalMeldingen === (s === "notCalculated" ? 2 : 1) && hout3.includes(`vt("${sleutel}", "${nl}")`), `${aantalMeldingen}× "${nl}"`);
}

// ── [2] Bestaat in alle talen, en/de/fr geen Nederlands ─────────────────
log("\n[2] Elke sleutel bestaat in nl/en/de/fr en is in en/de/fr geen Nederlands");
for (const s of ["check:props.load.pressBefore", "check:props.load.pressAfter"]) sleutels.add(s);
check(`${sleutels.size} sleutels verzameld`, sleutels.size >= 150, String(sleutels.size));
for (const taal of TALEN) {
  const ontbreekt = [...sleutels].filter((s) => tekst(taal, s) === undefined);
  check(`${taal}: alle sleutels aanwezig`, ontbreekt.length === 0, ontbreekt.slice(0, 6).join("; "));
}
const NEDERLANDS = new RegExp("\\b(" + [
  "verlopend", "verloop", "gelast", "gebied", "binnenland", "kuststrook", "begroeiing", "dorpen", "stedelijk",
  "leeshulp", "neerwaarts", "opwaarts", "dakvlak", "dakvlakken", "wrijving", "kolommen", "spant", "tussenspant",
  "kopgevel", "gevel", "leeg", "staaf", "plaat", "randlast", "puntlast", "opening", "openingen", "hoek", "hoeken",
  "eindstijfheid", "doorgerekend", "gebruikt", "oud", "koker", "buis", "warmvervaardigd", "gelijkbenig",
  "ongelijkbenig", "flenzen", "lijf", "flens", "wanden", "ligger", "onderplaat", "rug", "lamel", "deel", "gat",
  "schuift", "draaien", "spiegelen", "dekking", "beugel", "beugels", "beugelbenen", "wapening", "korf", "zijstaven",
  "zonder", "staven", "zone", "zones", "scheefstand", "noemer", "kolomlijn", "kolomlijnen", "oplegging", "knoop",
  "hoogte", "richting", "ongunstigste", "gekozen", "handmatig", "opgegeven", "waarde", "het", "een", "van", "niet",
  "geen", "moet", "zijn", "wordt",
].join("|") + ")\\b", "i");
// Woorden die in een andere taal gewoon zo heten.
const OOK_ELDERS = {
  en: new Set(["opening", "zone", "zones"]),
  de: new Set(["zone", "randlast", "binnenland"]),
  fr: new Set(["zone", "zones"]),
};
for (const taal of ["en", "de", "fr"]) {
  const nederlands2 = [];
  for (const s of sleutels) {
    const t = tekst(taal, s);
    if (t === undefined) continue;
    const zonder = t.replace(/\{\{[^}]*\}\}/g, "").replace(/`[^`]*`/g, "");
    const treffers = [...zonder.matchAll(new RegExp(NEDERLANDS.source, "gi"))]
      .map((m) => m[0].toLowerCase()).filter((w) => !OOK_ELDERS[taal].has(w));
    if (treffers.length > 0) nederlands2.push(`${s} = "${t}" (${treffers.join(", ")})`);
  }
  check(`${taal}: geen Nederlandse woorden`, nederlands2.length === 0, nederlands2.slice(0, 4).join("; "));
}
check("de woordenlijst herkent het Nederlands zelf",
  [...sleutels].filter((s) => NEDERLANDS.test(tekst("nl", s) ?? "")).length >= sleutels.size * 0.5);

// ── [3] Steekproeven via i18next ─────────────────────────────────────────
log("\n[3] Steekproeven in en/de/fr");
await zetTaal("de");
const tDe = i18next.getFixedT("de", "check");
check("de: \"Drücken Sie Entf, um diese Last zu löschen.\" (met komma, zonder spatie ervoor)",
  `${tDe("props.load.pressBefore")}Entf${tDe("props.load.pressAfter")}` === "Drücken Sie Entf, um diese Last zu löschen.",
  `${tDe("props.load.pressBefore")}Entf${tDe("props.load.pressAfter")}`);
for (const taal of TALEN) {
  const t = i18next.getFixedT(taal, "check");
  const zin = `${t("props.load.pressBefore")}X${t("props.load.pressAfter")}`;
  check(`${taal}: toetshint heeft precies één spatie of komma rond de toets`, /^\S.*\S X[ ,]\S/.test(zin) || /^\S.* X, \S/.test(zin), zin);
}
const tDeC = i18next.getFixedT("de", "common");
check("de: verlopend profiel",
  vertaalWaarde(tDeC, doorsnedeNaamTekst({ material: "S235", profile: "IPE 300", profileEnd: "IPE 200" })) === "IPE 300 → IPE 200 (gevoutet)");
check("de: gesplitste tussendoorsnede",
  vertaalWaarde(tDeC, profielNaamTekst("EIGEN:Gelast I 385×180×8,4×13,5")) === "EIGEN:Geschweißtes I 385×180×8,4×13,5");
const plaatMelding = bev.find((b) => b.tekst.startsWith("Randlast 9"));
check("de: modelcontrole bij een plaatlast",
  vertaal(tDeC, plaatMelding.tekstVertaalbaar) === "Randlast 9 auf Platte 1: die Last liegt auf Öffnung 1, aber diese Platte hat keine Öffnungen.",
  vertaal(tDeC, plaatMelding.tekstVertaalbaar));
await zetTaal("en");
const tEn = i18next.getFixedT("en", "common");
const cfLinks = windGevallen.find((g) => g.gv.sleutel === "luifel:cf:max:links" && g.dakvorm === "lessenaar");
check("en: vrijstaand dak c_f van links", cfLinks && vertaal(tEn, windGevalNaam(cfLinks.gv, cfLinks.dakvorm)) === "Wind canopy roof c_f downward, from the left",
  cfLinks && vertaal(tEn, windGevalNaam(cfLinks.gv, cfLinks.dakvorm)));
check("en: windgebied II", tEn("wind.regionOption.II") === "Zone II — north-western inland (v_b,0 = 27.0 m/s)");
check("en: combinatie niet gebruikt", vertaal(tEn, LABEL_ZUIVER_STAAL_TEKST) === "not used");
await zetTaal("fr");
const tFr = i18next.getFixedT("fr", "check");
const oud = REEKSEN.find((r) => r.id === "INP");
check("fr: reeks INP (oud)", vertaalWaarde(tFr, reeksLabel(oud)) === "INP (ancien)", vertaalWaarde(tFr, reeksLabel(oud)));
const zadelKop = scheefGevallen[1];
check("fr: scheefstandtooltip zonder Nederlands",
  !/scheefstand|kolomlijn|oplegging|richting: beide/i.test(sch.scheefstandToelichtingVertaald(zadelKop[1], zadelKop[0], i18next.getFixedT("fr", "common"))));
await zetTaal("nl");

// ── [4] De componenten gebruiken de vertaalbare vorm ─────────────────────
log("\n[4] De componenten gebruiken de vertaalbare vorm");
const tsx = [];
(function loop(map) {
  for (const n of readdirSync(map)) {
    const p = join(map, n);
    if (statSync(p).isDirectory()) loop(p);
    else if (n.endsWith(".tsx")) tsx.push(p);
  }
})(SRC);
const bron = (rel) => readFileSync(join(SRC, rel), "utf8");
const gebruik = (re) => tsx.filter((p) => re.test(readFileSync(p, "utf8"))).map((p) => p.slice(SRC.length + 1));
check("geen .tsx roept doorsnedeNaam( aan (alleen doorsnedeNaamVertaald)", gebruik(/\bdoorsnedeNaam\(/).length === 0, gebruik(/\bdoorsnedeNaam\(/).join(", "));
check("geen .tsx toont WINDGEBIEDEN/TERREIN_CATEGORIEEN[..].omschrijving of .bron",
  gebruik(/(WINDGEBIEDEN|TERREIN_CATEGORIEEN)\[[^\]]+\]\.(omschrijving|bron)/).length === 0);
check("geen .tsx toont preset.label of r.label van een reeks",
  gebruik(/preset\.label\b(?!Sleutel)|preset\.omschrijving\b|\{r\.label\}|label: r\.label/).length === 0,
  gebruik(/preset\.label\b(?!Sleutel)|preset\.omschrijving\b|\{r\.label\}|label: r\.label/).join(", "));
check("geen .tsx roept controleerKorf( of controleerZones( aan voor weergave",
  gebruik(/\bcontroleerKorf\(|\bcontroleerZones\(/).length === 0, gebruik(/\bcontroleerKorf\(|\bcontroleerZones\(/).join(", "));
check("de projectboom vertaalt de kop en het label van een overgeslagen combinatie",
  /m\.kop \? vertaal\(t, m\.kop\)/.test(bron("components/fem/FemProjectTree.tsx")) &&
  /vertaal\(t, overgeslagen\.labelTekst\)/.test(bron("components/fem/FemProjectTree.tsx")));
check("het canvas vertaalt de modelcontrole", /b\.tekstVertaalbaar \? vertaal\(tCommon, b\.tekstVertaalbaar\)/.test(bron("components/fem/FemCanvas.tsx")));
check("het windvenster vertaalt tabs en tabelkop",
  /tabLabel\(gv\)/.test(bron("lib/wind/WindGeneratorDialog.tsx")) && /gevalNaam\(geval\)/.test(bron("lib/wind/WindGeneratorDialog.tsx")));
check("de windtekening heeft geen vaste Nederlandse titels meer",
  !/Tussenspant op|— leeg|Staaf \$\{|Wind haaks op het spant|Alle windrichtingen|Plattegrond, gebouwlengte|Blokkering onder/.test(bron("lib/wind/WindSchema.tsx")));
check("de toetshint zet geen spaties rond de toets",
  /\{t\("props\.load\.pressBefore"\)\}<kbd>\{t\("props\.multi\.deleteKey"\)\}<\/kbd>\{t\("props\.load\.pressAfter"\)\}/.test(bron("components/fem/FemProperties.tsx")));
check("de φ-knop krijgt de vertaalde toelichting", /scheefstandToelichtingVertaald\(scheefstandUitkomst, scheefstandGeometrie, t\)/.test(bron("App.tsx")));

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
