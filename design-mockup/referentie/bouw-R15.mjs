// R15 — Portaalspant 30 m met gevoute knieën (IPE 500 kolom / IPE 450 ligger).
//
// Dit script BOUWT het model en schrijft het als projectbestand R15.femp weg
// met serializeProject, zodat het in de app te openen is. De doorrekening en
// de vergelijking met de referentiewaarden staan in toets-R15.mjs.
//
// Draaien vanuit design-mockup:  npx tsx referentie/bouw-R15.mjs
//
// ── Geometrie (dossier §5, R15) ────────────────────────────────────────────
//   overspanning 30 000 mm hart-op-hart kolommen
//   goothoogte (knie) 6 000 mm; onderzijde voute op de kolom 5 275 mm
//   dakhelling 5°, nok 7 313 mm boven de voet, spantbeen 15 057 mm
//   voute: getapte zone 2 740 mm in vier stukken van 685 mm (doorsneden 1..5)
//
// ── Waar de voute begint (afgeleid uit de bron zelf) ───────────────────────
// Het dossier geeft de voutemomenten 661 / 562 / 471 / 383 kN·m op de
// doorsneden 1..4 en 292/298 kN·m aan het einde van de voute, plus M_knie =
// 693/701 kN·m en V_knie = 150 kN. Uit die getallen volgt het momentverloop
//     M(s) = −697 + 150·s − 5,42·s²      (kN·m, s in m vanaf de knie)
// en daaruit liggen de vijf voutedoorsneden op s = 250 / 935 / 1620 / 2305 /
// 2990 mm. De getapte zone begint dus 250 mm van de kolom-AS — precies de
// halve kolomhoogte (IPE 500, h = 500 mm), oftewel de binnenzijde van de
// kolomflens. Dat is hier zo gemodelleerd, zodat de knopen exact op de
// toetsdoorsneden van de bron liggen.
//
// ── Wat de app WEL en NIET kan (belangrijke aanname) ───────────────────────
// De app kent per staaf alleen een MATERIAAL + PROFIELNAAM; er is geen invoer
// voor een vrije A/Iy en er zijn geen taps toelopende staven. De voutestukken
// krijgen in dit bestand daarom het profiel IPE 450 — dat is wat de app zelf
// van dit bestand kan maken. toets-R15.mjs rekent daarnaast een variant door
// waarin de voutestukken de A en Iy uit de bron krijgen (via de
// gedocumenteerde E/A/I-velden van de solver-adapter), zodat het verschil
// tussen "met voute" en "zonder voute" zichtbaar wordt.

import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const { serializeProject } = await import("../src/io/projectFile.ts");

const HIER = dirname(fileURLToPath(import.meta.url));

// ── Geometrie ──────────────────────────────────────────────────────────────
export const SPAN = 30000;          // mm, hart kolommen
export const H_GOOT = 6000;         // mm, knie
export const Z_KOLOMKOP = 5275;     // mm, onderzijde voute op de kolom
export const Z_TUSSEN = 3800;       // mm, 1 475 mm onder de kolomkop
export const HELLING = 5 * Math.PI / 180;
export const COS5 = Math.cos(HELLING);   // 0,9961947
export const SIN5 = Math.sin(HELLING);
export const Z_NOK = H_GOOT + (SPAN / 2) * Math.tan(HELLING);   // 7 312,33 mm (bron: 7 313)
export const L_SPANTBEEN = (SPAN / 2) / COS5;                   // 15 057,30 mm (bron: 15 057)

/**
 * Stations langs het spantbeen (mm vanaf de knie) waar een knoop komt.
 * 250..2990 = de vijf voutedoorsneden uit de bron; 6000/9000/12000 alleen om
 * het momentenverloop fijn genoeg af te tasten (mechanisch zonder effect:
 * dezelfde prismatische doorsnede en dezelfde verdeelde last).
 */
export const S_LANGS = [250, 935, 1620, 2305, 2990, 6000, 9000, 12000];

/**
 * Voutedoorsneden 1..4 uit de bron (uitsnede uit IPE 550 onder de IPE 450),
 * op s = 250 / 935 / 1620 / 2305 mm; doorsnede 5 (s = 2990 mm) is de kale
 * IPE 450. A in mm², Iy in mm⁴. Gebruikt door toets-R15.mjs.
 */
export const VOUTE_DOORSNEDEN = [
  { nr: 1, s: 250,  A: 15045, Iy: 200500e4 },
  { nr: 2, s: 935,  A: 13870, Iy: 144031e4 },
  { nr: 3, s: 1620, A: 12686, Iy:  98115e4 },
  { nr: 4, s: 2305, A: 11501, Iy:  62258e4 },
  { nr: 5, s: 2990, A:  9880, Iy:  337.4e6 },   // IPE 450
];

// ── Knopen ────────────────────────────────────────────────────────────────
const nodes = [];
const push = (id, x, z) => { nodes.push({ id, x, z }); return id; };

// Linker kolom
push(1, 0, 0);              // voet, scharnierend
push(2, 0, Z_TUSSEN);       // 1 475 mm onder de kolomkop
push(3, 0, Z_KOLOMKOP);     // kolomkop = onderzijde voute
push(4, 0, H_GOOT);         // knie links
// Rechter kolom
push(5, SPAN, 0);
push(6, SPAN, Z_TUSSEN);
push(7, SPAN, Z_KOLOMKOP);
push(8, SPAN, H_GOOT);      // knie rechts
// Linker spantbeen: knopen op de stations, gemeten vanaf knoop 4
S_LANGS.forEach((s, i) => push(9 + i, s * COS5, H_GOOT + s * SIN5));
// Nok
push(17, SPAN / 2, Z_NOK);
// Rechter spantbeen: gespiegeld, gemeten vanaf knoop 8
S_LANGS.forEach((s, i) => push(18 + i, SPAN - s * COS5, H_GOOT + s * SIN5));

// ── Staven ────────────────────────────────────────────────────────────────
// Kolommen IPE 500 S355, spantbeen IPE 450 S355. De voutestukken staan hier
// als IPE 450 (zie de toelichting bovenaan).
const beams = [];
const st = (id, from, to, profile) =>
  beams.push({ id, from, to, material: "S355", profile });

st(1, 1, 2, "IPE500"); st(2, 2, 3, "IPE500"); st(3, 3, 4, "IPE500");   // kolom links
st(4, 5, 6, "IPE500"); st(5, 6, 7, "IPE500"); st(6, 7, 8, "IPE500");   // kolom rechts

// Linker spantbeen: 4 -> 9 -> 10 -> ... -> 16 -> 17(nok)
const linksKetting = [4, 9, 10, 11, 12, 13, 14, 15, 16, 17];
for (let i = 0; i < linksKetting.length - 1; i++) {
  st(7 + i, linksKetting[i], linksKetting[i + 1], "IPE450");
}
// Rechter spantbeen: 8 -> 18 -> ... -> 25 -> 17(nok)
const rechtsKetting = [8, 18, 19, 20, 21, 22, 23, 24, 25, 17];
for (let i = 0; i < rechtsKetting.length - 1; i++) {
  st(16 + i, rechtsKetting[i], rechtsKetting[i + 1], "IPE450");
}

/**
 * Staaf-id's in het voutegebied, per zijde en op volgorde vanaf de knie:
 *   [0] = het stukje binnen de kolomdiepte (s = 0..250 mm, volle voutehoogte)
 *   [1..4] = de vier getapte stukken van 685 mm (doorsnede 1→2, 2→3, 3→4, 4→5)
 */
export const VOUTE_STAVEN = { links: [7, 8, 9, 10, 11], rechts: [16, 17, 18, 19, 20] };
/** Spantbeenstaven van knie naar nok, per zijde (voor het aftasten van M/V/N). */
export const SPANTBEEN = {
  links:  [7, 8, 9, 10, 11, 12, 13, 14, 15],
  rechts: [16, 17, 18, 19, 20, 21, 22, 23, 24],
};

// ── Opleggingen ───────────────────────────────────────────────────────────
// Beide kolomvoeten scharnierend (zo staat het in de bron voor de UGT-analyse).
const supports = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 5, type: "pinned" },
];

// ── Belastinggevallen en lasten ───────────────────────────────────────────
// Karakteristieke waarden per binnenportaal (h.o.h. 7,2 m):
//   permanent dakpakket 0,30 kN/m² × 7,20 = 2,16 kN/m  (+ eigen gewicht)
//   sneeuw              0,618 kN/m² × 7,20 = 4,45 kN/m
//   daklast type H      0,40 kN/m² × 7,20 = 2,88 kN/m
//   scheefstand         EHF = 0,60 kN per kolomtop
//
// AANNAME lastrichting: de lijnlasten staan hier per meter STAAFLENGTE van het
// spantbeen (dus "op de helling"). De bron zegt niet of de daklasten op de
// horizontale projectie staan; toets-R15.mjs rekent beide varianten door
// (verschil 1/cos 5° = 0,38 %).
const loadCases = [
  { id: 1, name: "G — permanent dak", type: "dead" },
  { id: 2, name: "S — sneeuw",        type: "snow" },
  { id: 3, name: "Q — daklast H",     type: "live" },
  { id: 4, name: "EHF — scheefstand", type: "other" },
];

export const Q_KAR = { G: -2.16, S: -4.45, Q: -2.88 };   // kN/m staaflengte
export const EHF_KN = 0.60;                              // kN per kolomtop

const loads = [];
let lid = 1;
const alleSpantbeen = [...SPANTBEEN.links, ...SPANTBEEN.rechts];
for (const [caseId, q] of [[1, Q_KAR.G], [2, Q_KAR.S], [3, Q_KAR.Q]]) {
  for (const bid of alleSpantbeen) {
    loads.push({ id: lid++, type: "lineLoad", caseId, beamId: bid, q, qDir: "z", qCoord: "global" });
  }
}
// Scheefstand als expliciete equivalente horizontale kracht op beide kolomtoppen
// (zo staat het in de bron: EHF = 0,60 kN per kolomtop), niet via de
// scheefstand-schakelaar van de app — die verdeelt φ·V over álle verticale
// lasten en zet hem dus niet als puntlast op de knie.
loads.push({ id: lid++, type: "pointForce", caseId: 4, nodeId: 4, fx: EHF_KN, fz: 0 });
loads.push({ id: lid++, type: "pointForce", caseId: 4, nodeId: 8, fx: EHF_KN, fz: 0 });

// ── Combinaties ───────────────────────────────────────────────────────────
const combinations = [
  {
    id: 1, name: "UGT 1,35G + 1,5S + EHF", type: "uls",
    formula: "1,35·G + 1,5·S + 1,0·EHF",
    factors: { "1": 1.35, "2": 1.5, "4": 1.0 },
  },
  {
    id: 2, name: "UGT 1,35G + 1,5S (zonder EHF)", type: "uls",
    formula: "1,35·G + 1,5·S",
    factors: { "1": 1.35, "2": 1.5 },
  },
  {
    id: 3, name: "UGT 1,35G + 1,5Q + EHF", type: "uls",
    formula: "1,35·G + 1,5·Q + 1,0·EHF",
    factors: { "1": 1.35, "3": 1.5, "4": 1.0 },
  },
];

// ── Wegschrijven ──────────────────────────────────────────────────────────
const state = {
  nodes, beams, supports, plates: [],
  loads, loadCases,
  activeLoadCaseId: 1,
  selfWeightEnabled: true,     // de bron rekent eigen gewicht mee (zie dossier)
  nonlinearEnabled: false,     // elastische EERSTE-orde berekening
  combinations,
  scheefstandEnabled: false,   // EHF staat als expliciet belastinggeval 4
  scheefstandNoemer: 200,
  scheefstandRichting: 1,
};

// Alleen schrijven wanneer dit bestand RECHTSTREEKS gedraaid wordt; toets-R15.mjs
// importeert de constanten hierboven en moet niet stilzwijgend het model
// overschrijven dat het aan het narekenen is.
const rechtstreeks = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (rechtstreeks) {
  const tekst = serializeProject(state);
  const pad = join(HIER, "R15.femp");
  writeFileSync(pad, tekst, "utf8");
  // Zelfde inhoud onder de extensie waarop het openen-dialoog van de app
  // filtert (PROJECT_FILE_EXT = "ifcfem2d"), zodat het bestand ook echt in
  // de app te selecteren is.
  writeFileSync(join(HIER, "R15.ifcfem2d"), tekst, "utf8");
  process.stdout.write(
    `R15.femp + R15.ifcfem2d geschreven: ${nodes.length} knopen, ${beams.length} staven, ` +
    `${loads.length} lasten, ${loadCases.length} belastinggevallen\n` +
    `  nok z = ${Z_NOK.toFixed(1)} mm (bron 7 313), spantbeen = ${L_SPANTBEEN.toFixed(1)} mm (bron 15 057)\n` +
    `  pad: ${pad}\n`,
  );
}
