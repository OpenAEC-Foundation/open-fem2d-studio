// R15 — Portaalspant 30 m met gevoute knieën: doorrekenen en vergelijken met
// de referentiewaarden uit docs/superpowers/plans/2026-09-02-referentieberekeningen.md
//
// Draaien vanuit design-mockup:  npx tsx referentie/toets-R15.mjs
// (het model komt uit referentie/R15.femp; maken met bouw-R15.mjs)
//
// ── Wat hier gebeurt ───────────────────────────────────────────────────────
// Het projectbestand gaat door dezelfde mapping als de app zelf
// (bouwMultiInput → solveAllCases → combineResults), zodat wat hier uitkomt
// letterlijk is wat de app op het scherm zet. Daarnaast wordt één VARIANT
// doorgerekend die de app niet kan invoeren: het voutegebied met de A en Iy
// uit de bron. De app kent namelijk geen vrije doorsnedegrootheden en geen
// taps toelopende staven — zie het kopcommentaar van bouw-R15.mjs.
//
// ── Tolerantie ─────────────────────────────────────────────────────────────
// Het dossier zet dit geval op 5 % (modelleeraannames domineren). Waarden
// boven 2 % worden hieronder apart gemarkeerd zodat ze onderzocht worden.
//
// ── Wat NIET nagerekend wordt en waarom ───────────────────────────────────
// De rijen met doorsnedeklasse, Nb,Rd, Mb,Rd en de unity checks komen uit de
// EN 1993-1-1-toetskern (Rust). Die kern is in deze build van v2 niet
// aanwezig: design-mockup/src-tauri/src/lib.rs kent geen command
// `check_steel_beams`. Die rijen staan hieronder als "niet nagerekend" met
// die reden. De weerstanden die een gesloten formule zijn (Nc,Rd, Mc,Rd,
// Vpl,Rd, Ncr) worden wél nagerekend — met de doorsnedegegevens uit ONZE
// profieldatabase, zodat die database meteen mee gevalideerd wordt.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { deserializeProject } = await import("../src/io/projectFile.ts");
const { bouwMultiInput } = await import("../src/lib/modelNaarSolverInput.ts");
const { solve, solveAllCases } = await import("../src/components/fem/solver/engine.ts");
const { combineResults } = await import("../src/components/fem/solver/combinations.ts");
const { STEEL_SECTIONS } = await import("../src/lib/steelSections.generated.ts");
const { STEEL_SECTION_DIMS } = await import("../src/lib/steelSectionDims.generated.ts");
const { VOUTE_DOORSNEDEN, VOUTE_STAVEN, SPANTBEEN, COS5, L_SPANTBEEN, H_GOOT } =
  await import("./bouw-R15.mjs");

const HIER = dirname(fileURLToPath(import.meta.url));
const model = deserializeProject(readFileSync(join(HIER, "R15.femp"), "utf8"));

const log = (s) => process.stdout.write(s + "\n");
const RHO_STAAL = 7850, G = 9.81;

// ── Referentiewaarden uit het dossier ─────────────────────────────────────
const REF = {
  V_voet: 168, H_voet: 116, V_totaal: 336, H_totaal: 0,
  N_ligger_max: 130,
  Ncr_liggerpaar: 772, Ncr_toets: 69,
  delta_NHF: 1.6, alpha_cr: 12.5,
  M_kolomkop_L: 610, M_kolomkop_R: 616,
  V_kolomkop: 117, N_kolomkop: 162,
  M_kolom_1475: 444, M_kolom_2e: 221,
  V_kolomvoet: 117, N_kolomvoet: 168, M_kolomvoet: 0,
  M_knie_L: 693, M_knie_R: 701, V_knie: 150, N_knie: 130,
  M_eindvoute_L: 292, M_eindvoute_R: 298,
  V_eindvoute_L: 117, V_eindvoute_R: 118, N_eindvoute: 127,
  M_nok_L: 356, V_nok_L: 0, N_nok_L: 117,
  M_nok_R: 351, V_nok_R: 10, N_nok_R: 116,
  s_nul_L: 5869, s_nul_R: 5941,
  V_bij_nul_L: 87, V_bij_nul_R: 86, N_bij_nul: 124,
  M_voute: [661, 562, 471, 383],
  N_voute: [129, 129, 128, 127],
  V_voute_max: 147,
  sigma_voute: 174,
  // Gesloten-formule-weerstanden
  Av_kolom: 6035, Vpl_kolom: 1237, Nc_kolom: 4118, Mc_kolom: 779,
  Vpl_ligger: 1042, Nc_ligger: 3507, Mc_ligger: 604,
  Mc_voute: 1440, halveVpl_kolom: 619, kwartNpl_kolom: 1030,
};

// ── Telwerk ───────────────────────────────────────────────────────────────
let regels = [];
function vgl(grootheid, ref, ons, eenheid = "", opm = "") {
  const dev = (ref === 0)
    ? (Math.abs(ons) < 0.5 ? 0 : NaN)
    : (ons - ref) / Math.abs(ref) * 100;
  regels.push({ grootheid, ref, ons, dev, eenheid, opm });
  return dev;
}
function getal(v) {
  if (v === null) return "—";
  if (Math.abs(v) >= 1e7) return v.toExponential(4);
  return v.toFixed(Math.abs(v) >= 100 ? 1 : 2);
}
function tabel(titel, rijen) {
  log(`\n${titel}`);
  log("─".repeat(112));
  log("grootheid".padEnd(46) + "referentie".padStart(12) + "onze waarde".padStart(14) +
      "Δ".padStart(10) + "  opmerking");
  log("─".repeat(112));
  for (const r of rijen) {
    const ref = typeof r.ref === "number" ? getal(r.ref).replace(/\.00$/, "") : String(r.ref);
    const ons = getal(r.ons);
    const dev = r.dev === null ? "—"
      : (Number.isNaN(r.dev) ? "n.v.t." : `${r.dev >= 0 ? "+" : ""}${r.dev.toFixed(1)} %`);
    const vlag = (r.dev !== null && !Number.isNaN(r.dev) && Math.abs(r.dev) > 2) ? " ⚠" : "  ";
    log(r.grootheid.padEnd(46) + ref.padStart(12) + ons.padStart(14) + dev.padStart(10) + vlag + r.opm);
  }
  log("─".repeat(112));
}

// ── Modelvarianten ────────────────────────────────────────────────────────
/**
 * Bouwt de solver-invoer uit het projectbestand, precies zoals de app dat doet.
 *  - voute "geen"  : het bestand zoals het is (voutestukken = IPE 450). Dít is
 *                    wat de app zelf uit R15.femp maakt.
 *  - voute "taps"  : de voutestukken krijgen de A en Iy uit de bron. Per stuk
 *                    het GEMIDDELDE van de twee einddoorsneden (de gangbare
 *                    prismatische benadering van een taps element); het stukje
 *                    binnen de kolomdiepte krijgt doorsnede 1. Het eigen
 *                    gewicht van die stukken wordt meegecorrigeerd (ρ·A·g),
 *                    anders zou de verticale reactie de voute missen.
 *  - projectie     : daklasten op de horizontale projectie i.p.v. op de
 *                    staaflengte (×cos 5°).
 */
function bouwInvoer({ voute = "geen", projectie = false } = {}) {
  const mi = bouwMultiInput({
    nodes: model.nodes, beams: model.beams, supports: model.supports, plates: [],
    loadCases: model.loadCases, loads: model.loads,
    selfWeightEnabled: model.selfWeightEnabled,
    scheefstandEnabled: model.scheefstandEnabled ?? false,
    scheefstandNoemer: model.scheefstandNoemer ?? 200,
    scheefstandRichting: model.scheefstandRichting ?? 1,
  });
  const qEigenIPE450 = -(RHO_STAAL * STEEL_SECTIONS["IPE450"].A * 1e-6 * G) / 1000;

  if (voute === "taps") {
    const D = VOUTE_DOORSNEDEN;
    for (const zijde of ["links", "rechts"]) {
      VOUTE_STAVEN[zijde].forEach((bid, k) => {
        // k = 0 → stukje binnen de kolomdiepte (volle voutehoogte, doorsnede 1)
        // k = 1..4 → getapt stuk tussen doorsnede k en k+1 → gemiddelde
        const sec = k === 0
          ? { A: D[0].A, Iy: D[0].Iy }
          : { A: (D[k - 1].A + D[k].A) / 2, Iy: (D[k - 1].Iy + D[k].Iy) / 2 };
        const b = mi.beams.find((x) => x.id === bid);
        b.A = sec.A; b.I = sec.Iy;
        const ew = mi.loads.find((l) => l.beamId === bid && l.caseId === 1 &&
          Math.abs(l.q - qEigenIPE450) < 1e-9);
        if (ew) ew.q = -(RHO_STAAL * sec.A * 1e-6 * G) / 1000;
      });
    }
  }
  if (projectie) {
    for (const l of mi.loads) {
      if (l.caseId >= 1 && l.caseId <= 3 && model.loads.some(
        (m) => m.beamId === l.beamId && m.caseId === l.caseId && m.q === l.q)) {
        l.q = l.q * COS5;   // alleen de HANDMATIGE daklasten, niet het eigen gewicht
      }
    }
  }
  return mi;
}

const COMBO_EHF = { id: 1, name: "1,35G+1,5S+EHF", type: "uls", formula: "",
  factors: new Map([[1, 1.35], [2, 1.5], [4, 1.0]]) };

function reken(mi) {
  return combineResults(COMBO_EHF, solveAllCases(mi).perCase);
}

// ── Uitlezen ──────────────────────────────────────────────────────────────
/** Momenten/krachten van het spantbeen als één doorlopende reeks vanaf de knie. */
function spantbeenReeks(r, ids) {
  const pts = [];
  let s0 = 0;
  for (const id of ids) {
    const e = r.elements.get(id);
    for (let i = 0; i < e.stations_mm.length; i++) {
      // dubbele knooppunten overslaan behalve bij het eerste element
      if (i === 0 && pts.length > 0) continue;
      pts.push({
        s: s0 + e.stations_mm[i],
        M: e.bendingMoment[i] / 1e6,      // kNm
        V: e.shearForce[i] / 1e3,         // kN
        N: e.normalForce[i] / 1e3,        // kN
      });
    }
    s0 += e.L_mm;
  }
  return pts;
}
/** Waarde op afstand s (lineair tussen de dichtstbijzijnde stations). */
function opS(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].s >= s - 1e-6) {
      const a = pts[i - 1], b = pts[i];
      const f = (s - a.s) / (b.s - a.s || 1);
      return { s, M: a.M + f * (b.M - a.M), V: a.V + f * (b.V - a.V), N: a.N + f * (b.N - a.N) };
    }
  }
  return pts[pts.length - 1];
}
/** Plaats waar M door nul gaat (eerste tekenwissel na de knie). */
function nulpunt(pts) {
  for (let i = 1; i < pts.length; i++) {
    if (Math.sign(pts[i].M) !== Math.sign(pts[i - 1].M) && pts[i - 1].M !== 0) {
      const a = pts[i - 1], b = pts[i];
      const f = a.M / (a.M - b.M);
      return { s: a.s + f * (b.s - a.s), V: a.V + f * (b.V - a.V), N: a.N + f * (b.N - a.N) };
    }
  }
  return null;
}
/** Grootste veldmoment (tegengesteld teken aan het knie-moment) + plaats. */
function veldMax(pts) {
  const tekenKnie = Math.sign(pts[0].M);
  let best = null;
  for (const p of pts) {
    const veld = -tekenKnie * p.M;
    if (best === null || veld > best.M) best = { s: p.s, M: veld, V: p.V, N: p.N };
  }
  return best;
}
/**
 * Punt in het veld waar |V| een gegeven waarde heeft, het dichtst bij de nok.
 * De bron geeft de rechter noksnede met VEd = 10 kN (niet het maximum), dus
 * die moet met hetzelfde punt vergeleken worden, niet met M_max.
 */
function bijShear(pts, doel) {
  const tekenKnie = Math.sign(pts[0].M);
  let best = null;
  for (const p of pts) {
    const afw = Math.abs(Math.abs(p.V) - doel);
    if (best === null || afw < best.afw) best = { afw, s: p.s, M: -tekenKnie * p.M, V: p.V, N: p.N };
  }
  return best;
}

function meet(r) {
  const L = spantbeenReeks(r, SPANTBEEN.links);
  const R = spantbeenReeks(r, SPANTBEEN.rechts);
  const Rv1 = r.reactions.get(1), Rv5 = r.reactions.get(5);
  const kolomL = r.elements.get(3), kolomR = r.elements.get(6);
  const voetL = r.elements.get(1);
  const nokL = veldMax(L), nokR = veldMax(R);
  const nulL = nulpunt(L), nulR = nulpunt(R);
  return {
    V_L: Rv1.fz / 1e3, V_R: Rv5.fz / 1e3,
    H_L: Rv1.fx / 1e3, H_R: Rv5.fx / 1e3,
    M_knie_L: Math.abs(L[0].M), M_knie_R: Math.abs(R[0].M),
    V_knie_L: Math.abs(L[0].V), V_knie_R: Math.abs(R[0].V),
    N_knie_L: Math.abs(L[0].N), N_knie_R: Math.abs(R[0].N),
    M_kop_L: Math.abs(kolomL.bendingMoment[0]) / 1e6,
    M_kop_R: Math.abs(kolomR.bendingMoment[0]) / 1e6,
    // De kolommen dragen geen dwarsbelasting → V is over de hele kolom
    // constant en gelijk aan de horizontale oplegreactie. De bron geeft één
    // waarde (117 kN) voor kop én voet; hier het gemiddelde van links/rechts.
    V_kolom: (Math.abs(Rv1.fx) + Math.abs(Rv5.fx)) / 2e3,
    N_kop: Math.abs(kolomR.normalForce[0]) / 1e3,
    M_1475: Math.abs(r.elements.get(5).bendingMoment[0]) / 1e6,   // knoop 6, z = 3800
    N_voet: Math.abs(r.elements.get(4).normalForce[0]) / 1e3,
    M_voet: Math.abs(voetL.bendingMoment[0]) / 1e6,
    voute_L: VOUTE_DOORSNEDEN.slice(0, 4).map((d) => opS(L, d.s)),
    eind_L: opS(L, 2990), eind_R: opS(R, 2990),
    nok_L: nokL, nok_R: nokR,
    nokV10_R: bijShear(R, 10),
    nul_L: nulL, nul_R: nulR,
    N_max: Math.max(...L.map((p) => Math.abs(p.N)), ...R.map((p) => Math.abs(p.N))),
    V_voute_max: Math.max(...L.filter((p) => p.s <= 2990).map((p) => Math.abs(p.V))),
  };
}

// ── Doorrekenen ───────────────────────────────────────────────────────────
log("\n" + "═".repeat(112));
log("R15 — Portaalspant 30 m met gevoute knieën (IPE 500 / IPE 450), UGT 1,35G + 1,5S + EHF");
log("═".repeat(112));

const varianten = {
  kaal:  meet(reken(bouwInvoer({ voute: "geen" }))),
  taps:  meet(reken(bouwInvoer({ voute: "taps" }))),
  kaalP: meet(reken(bouwInvoer({ voute: "geen", projectie: true }))),
  tapsP: meet(reken(bouwInvoer({ voute: "taps", projectie: true }))),
};

// ── Hoofdvergelijking (variant "kaal": wat de app uit R15.femp maakt) ─────
regels = [];
const A = varianten.kaal;
vgl("Verticale oplegreactie per voet VEd", REF.V_voet, (A.V_L + A.V_R) / 2, "kN");
vgl("Horizontale oplegreactie per voet HEd", REF.H_voet, (Math.abs(A.H_L) + Math.abs(A.H_R)) / 2, "kN");
vgl("Totaal VEd", REF.V_totaal, A.V_L + A.V_R, "kN");
vgl("Totaal HEd", REF.H_totaal, A.H_L + A.H_R, "kN", "= −ΣEHF = −1,2 kN, bron rondt op 0 af");
vgl("Maximale normaalkracht in de ligger", REF.N_ligger_max, A.N_max, "kN");
vgl("Kolomkop MEd links (z = 5 275)", REF.M_kolomkop_L, A.M_kop_L, "kNm");
vgl("Kolomkop MEd rechts (z = 5 275)", REF.M_kolomkop_R, A.M_kop_R, "kNm");
vgl("Kolomkop VEd", REF.V_kolomkop, A.V_kolom, "kN", "V is constant over de kolom");
vgl("Kolomkop NEd", REF.N_kolomkop, A.N_kop, "kN");
vgl("Kolom 1 475 mm onder de kop (z = 3 800)", REF.M_kolom_1475, A.M_1475, "kNm");
vgl("Kolomvoet VEd", REF.V_kolomvoet, A.V_kolom, "kN");
vgl("Kolomvoet NEd", REF.N_kolomvoet, A.N_voet, "kN");
vgl("Kolomvoet MEd", REF.M_kolomvoet, A.M_voet, "kNm", "scharnier → exact 0");
vgl("Knie links MEd", REF.M_knie_L, A.M_knie_L, "kNm");
vgl("Knie rechts MEd", REF.M_knie_R, A.M_knie_R, "kNm");
vgl("Knie VEd", REF.V_knie, (A.V_knie_L + A.V_knie_R) / 2, "kN");
vgl("Knie NEd", REF.N_knie, (A.N_knie_L + A.N_knie_R) / 2, "kN");
vgl("Einde voute links MEd (s = 2 990)", REF.M_eindvoute_L, Math.abs(A.eind_L.M), "kNm");
vgl("Einde voute rechts MEd (s = 2 990)", REF.M_eindvoute_R, Math.abs(A.eind_R.M), "kNm");
vgl("Einde voute VEd links", REF.V_eindvoute_L, Math.abs(A.eind_L.V), "kN");
vgl("Einde voute VEd rechts", REF.V_eindvoute_R, Math.abs(A.eind_R.V), "kN");
vgl("Einde voute NEd", REF.N_eindvoute, (Math.abs(A.eind_L.N) + Math.abs(A.eind_R.N)) / 2, "kN");
vgl("Veldmoment nabij de nok links (VEd = 0)", REF.M_nok_L, A.nok_L.M, "kNm",
    `maximum, op s = ${A.nok_L.s.toFixed(0)} mm`);
vgl("Veldmoment nabij de nok rechts (VEd = 10 kN)", REF.M_nok_R, A.nokV10_R.M, "kNm",
    `op s = ${A.nokV10_R.s.toFixed(0)} mm, V = ${Math.abs(A.nokV10_R.V).toFixed(1)} kN`);
vgl("NEd bij het veldmoment (links)", REF.N_nok_L, Math.abs(A.nok_L.N), "kN");
vgl("NEd bij het veldmoment (rechts)", REF.N_nok_R, Math.abs(A.nokV10_R.N), "kN");
vgl("Momentnulpunt links (mm vanaf de knie)", REF.s_nul_L, A.nul_L.s, "mm");
vgl("Momentnulpunt rechts (mm vanaf de knie)", REF.s_nul_R, A.nul_R.s, "mm");
vgl("VEd bij M = 0, links", REF.V_bij_nul_L, Math.abs(A.nul_L.V), "kN");
vgl("VEd bij M = 0, rechts", REF.V_bij_nul_R, Math.abs(A.nul_R.V), "kN");
vgl("NEd bij M = 0", REF.N_bij_nul, (Math.abs(A.nul_L.N) + Math.abs(A.nul_R.N)) / 2, "kN");
for (let i = 0; i < 4; i++) {
  vgl(`Voutedoorsnede ${i + 1}: MEd (s = ${VOUTE_DOORSNEDEN[i].s} mm)`,
      REF.M_voute[i], Math.abs(A.voute_L[i].M), "kNm");
  vgl(`Voutedoorsnede ${i + 1}: NEd`, REF.N_voute[i], Math.abs(A.voute_L[i].N), "kN");
}
vgl("Voute: grootste VEd", REF.V_voute_max, A.V_voute_max, "kN");
tabel("① Model zoals de APP het uit R15.femp rekent (voutegebied = kale IPE 450)", regels);
const kaalRegels = regels;

// ── Zelfde vergelijking met de voutestijfheid uit de bron ─────────────────
regels = [];
const B = varianten.taps;
vgl("Horizontale oplegreactie per voet HEd", REF.H_voet, (Math.abs(B.H_L) + Math.abs(B.H_R)) / 2, "kN");
vgl("Totaal VEd", REF.V_totaal, B.V_L + B.V_R, "kN");
vgl("Knie links MEd", REF.M_knie_L, B.M_knie_L, "kNm");
vgl("Knie rechts MEd", REF.M_knie_R, B.M_knie_R, "kNm");
vgl("Kolomkop MEd rechts", REF.M_kolomkop_R, B.M_kop_R, "kNm");
vgl("Einde voute links MEd", REF.M_eindvoute_L, Math.abs(B.eind_L.M), "kNm");
vgl("Grootste veldmoment nabij de nok, links", REF.M_nok_L, B.nok_L.M, "kNm");
vgl("Maximale normaalkracht in de ligger", REF.N_ligger_max, B.N_max, "kN");
vgl("Momentnulpunt links", REF.s_nul_L, B.nul_L.s, "mm");
for (let i = 0; i < 4; i++) {
  vgl(`Voutedoorsnede ${i + 1}: MEd`, REF.M_voute[i], Math.abs(B.voute_L[i].M), "kNm");
}
tabel("② Zelfde model MET de voutestijfheid uit de bron (kan de app NIET invoeren)", regels);
const tapsRegels = regels;

// ── Lastrichting: helling versus horizontale projectie ────────────────────
log("\n③ Gevoeligheid lastrichting (dossier vraagt beide varianten)");
log("─".repeat(112));
for (const [naam, v] of [["op de staaflengte (helling)", varianten.kaal],
                         ["op de horizontale projectie", varianten.kaalP]]) {
  log(`  kale doorsneden, daklast ${naam.padEnd(30)}` +
      `ΣV = ${(v.V_L + v.V_R).toFixed(1)} kN   H = ${((Math.abs(v.H_L) + Math.abs(v.H_R)) / 2).toFixed(2)} kN   ` +
      `M_knie = ${v.M_knie_L.toFixed(1)} / ${v.M_knie_R.toFixed(1)} kNm`);
}
for (const [naam, v] of [["op de staaflengte (helling)", varianten.taps],
                         ["op de horizontale projectie", varianten.tapsP]]) {
  log(`  met voute,      daklast ${naam.padEnd(30)}` +
      `ΣV = ${(v.V_L + v.V_R).toFixed(1)} kN   H = ${((Math.abs(v.H_L) + Math.abs(v.H_R)) / 2).toFixed(2)} kN   ` +
      `M_knie = ${v.M_knie_L.toFixed(1)} / ${v.M_knie_R.toFixed(1)} kNm`);
}
log(`  referentie                                          ` +
    `ΣV = ${REF.V_totaal} kN   H = ${REF.H_voet} kN   M_knie = ${REF.M_knie_L} / ${REF.M_knie_R} kNm`);
log("─".repeat(112));

// ── Scheefstandsverplaatsing (α_cr-model) ────────────────────────────────
log("\n④ Horizontale verplaatsing kolomtop onder NHF = 0,84 kN");
log("─".repeat(112));
log("  De bron gebruikt voor dit model een VOETSTIJFHEID van 10 % van de kolomstijfheid.");
log("  Die is in de app niet in te voeren: een oplegging is óf 'pinned' óf 'rotSpring',");
log("  en een rotatieveer laat de translaties vrij (applySupportToMesh in solver/engine.ts");
log("  zet het hele constraints-object over). Daarom hieronder de BANDBREEDTE tussen");
log("  scharnierende en ingeklemde voeten; de referentie moet daar tussenin vallen.");
for (const voute of ["geen", "taps"]) {
  for (const voet of ["pinned", "fixed"]) {
    const mi = bouwInvoer({ voute });
    const r = solve({
      nodes: mi.nodes, beams: mi.beams,
      supports: mi.supports.map((s) => ({ ...s, type: voet })),
      loads: [],
      pointLoads: [{ nodeId: 4, fx: 840 }, { nodeId: 8, fx: 840 }],
    });
    log(`  voute=${voute.padEnd(5)} voet=${voet.padEnd(7)} → ux kolomtop = ` +
        `${r.displacements.get(4).ux.toFixed(3)} mm`);
  }
}
log(`  referentie: ${REF.delta_NHF} mm`);
log("─".repeat(112));

// ── Herleiding: het hele verschil zit in één grootheid ───────────────────
// Bij een tweescharnierportaal is de horizontale reactie H de ENIGE
// statisch onbepaalde onbekende. Elk moment is
//     M(punt) = M_statisch bepaald(punt) ∓ H·z(punt)
// met z de hoogte boven het scharnier. Wijkt alleen H af, dan moet de
// correctie ΔM = ΔH·z ELK vergeleken moment op de referentiewaarde brengen.
// Doet hij dat, dan is bewezen dat er geen tweede oorzaak is: de statica en
// de dwarskracht-/normaalkrachtverdeling kloppen en het verschil komt
// volledig uit de stijfheidsverdeling (voute).
regels = [];
let herleidKop = "";
{
  const dH = REF.H_voet - (Math.abs(A.H_L) + Math.abs(A.H_R)) / 2;   // kN
  const zVan = (s) => (H_GOOT + s * Math.sin(5 * Math.PI / 180)) / 1000;   // m
  const corrHog = (M, z) => M + dH * z;      // steunpuntmoment: neemt toe met H
  const corrVeld = (M, z) => M - dH * z;     // veldmoment: neemt af met H
  herleidKop = "⑤ Herleiding: alle momenten na correctie voor UITSLUITEND " +
    `ΔH = H_ref − H_ons = ${dH.toFixed(2)} kN (ΔM = ΔH·z)`;
  vgl("Knie links MEd", REF.M_knie_L, corrHog(A.M_knie_L, 6.0), "kNm");
  vgl("Knie rechts MEd", REF.M_knie_R, corrHog(A.M_knie_R, 6.0), "kNm");
  vgl("Kolomkop MEd links", REF.M_kolomkop_L, corrHog(A.M_kop_L, 5.275), "kNm");
  vgl("Kolomkop MEd rechts", REF.M_kolomkop_R, corrHog(A.M_kop_R, 5.275), "kNm");
  vgl("Kolom op z = 3 800", REF.M_kolom_1475, corrHog(A.M_1475, 3.8), "kNm");
  for (let i = 0; i < 4; i++) {
    vgl(`Voutedoorsnede ${i + 1}: MEd`, REF.M_voute[i],
        corrHog(Math.abs(A.voute_L[i].M), zVan(VOUTE_DOORSNEDEN[i].s)), "kNm");
  }
  vgl("Einde voute links MEd", REF.M_eindvoute_L, corrHog(Math.abs(A.eind_L.M), zVan(2990)), "kNm");
  vgl("Einde voute rechts MEd", REF.M_eindvoute_R, corrHog(Math.abs(A.eind_R.M), zVan(2990)), "kNm");
  vgl("Veldmoment nok links", REF.M_nok_L, corrVeld(A.nok_L.M, zVan(A.nok_L.s)), "kNm");
  vgl("Veldmoment nok rechts (V = 10 kN)", REF.M_nok_R,
      corrVeld(A.nokV10_R.M, zVan(A.nokV10_R.s)), "kNm");
}
tabel(herleidKop, regels);
const herleidRegels = regels;

// ── Gesloten formules (valideren meteen onze profieldatabase) ────────────
regels = [];
const E = 210000, fy = 355;
const ipe500 = STEEL_SECTIONS["IPE500"], ipe450 = STEEL_SECTIONS["IPE450"];
const d500 = STEEL_SECTION_DIMS["IPE500"].props, d450 = STEEL_SECTION_DIMS["IPE450"].props;
const Lcr = (30000 / COS5);                                   // 30 114 mm
const Ncr = Math.PI ** 2 * E * ipe450.Iy / Lcr ** 2 / 1e3;    // kN
vgl("Ncr liggerpaar (Lcr = 30/cos5° = 30,11 m)", REF.Ncr_liggerpaar, Ncr, "kN",
    "π²·E·I_IPE450/Lcr²");
vgl("0,09·Ncr", REF.Ncr_toets, 0.09 * Ncr, "kN", `< NEd = ${A.N_max.toFixed(0)} kN → drukkracht significant`);
vgl("Kolom IPE 500: Av,z", REF.Av_kolom, d500.avZ, "mm²", "uit onze profieldatabase");
vgl("Kolom IPE 500: Vpl,Rd", REF.Vpl_kolom, d500.avZ * fy / Math.sqrt(3) / 1e3, "kN");
vgl("Kolom IPE 500: Nc,Rd", REF.Nc_kolom, ipe500.A * fy / 1e3, "kN");
vgl("Kolom IPE 500: Mc,Rd = Wpl,y·fy", REF.Mc_kolom, d500.wplY * fy / 1e6, "kNm");
vgl("Kolom: 0,5·Vpl,Rd", REF.halveVpl_kolom, 0.5 * d500.avZ * fy / Math.sqrt(3) / 1e3, "kN");
vgl("Kolom: 0,25·Npl,Rd", REF.kwartNpl_kolom, 0.25 * ipe500.A * fy / 1e3, "kN");
vgl("Ligger IPE 450: Vpl,Rd", REF.Vpl_ligger, d450.avZ * fy / Math.sqrt(3) / 1e3, "kN");
vgl("Ligger IPE 450: Nc,Rd", REF.Nc_ligger, ipe450.A * fy / 1e3, "kN");
vgl("Ligger IPE 450: Mc,Rd = Wpl,y·fy", REF.Mc_ligger, d450.wplY * fy / 1e6, "kNm");
vgl("Voute doorsnede 1: Mc,Rd = Wel,min·fy", REF.Mc_voute, 4055e3 * fy / 1e6, "kNm",
    "Wel,min = 4 055·10³ mm³ uit de bron");
vgl("Voute doorsnede 1: σx,Ed = M/Wel + N/A", REF.sigma_voute,
    661e6 / 4055e3 + 129e3 / 15045, "N/mm²", "M en N uit de bron");
tabel("⑥ Gesloten formules (handformule met ONZE profieldata)", regels);
const formuleRegels = regels;

// ── Profieldata naast de bron ─────────────────────────────────────────────
regels = [];
vgl("IPE 500: A", 11600, ipe500.A, "mm²");
vgl("IPE 500: Iy", 48200e4, ipe500.Iy, "mm⁴");
vgl("IPE 500: Iz", 2142e4, d500.iz, "mm⁴");
vgl("IPE 500: Wpl,y", 2194e3, d500.wplY, "mm³");
vgl("IPE 500: iy", 204, d500.iRadY, "mm");
vgl("IPE 500: iz", 43.1, d500.iRadZ, "mm");
vgl("IPE 500: It", 89.3e4, d500.it, "mm⁴");
vgl("IPE 500: Iw", 1249e9, d500.iw, "mm⁶");
vgl("IPE 450: A", 9880, ipe450.A, "mm²");
vgl("IPE 450: Wpl,y", 1702e3, d450.wplY, "mm³");
tabel("⑦ Onze profieldatabase naast de doorsnedegegevens in de bron", regels);
const profielRegels = regels;

// ── Niet nagerekende referentiewaarden ───────────────────────────────────
// ── Onafhankelijke controle van de solver zelf ───────────────────────────
// De krachtenmethode geeft voor een tweescharnierportaal de gesloten uitdrukking
//     H = ∫ M0·z /(EI) ds  ÷  ∫ z²/(EI) ds
// met M0 het momentenverloop in het hoofdsysteem (links scharnier, rechts rol).
// Dit is een DERDE partij: geen stijfheidsmatrix, geen adapter, alleen
// numerieke integratie langs de staafassen. Wijkt de solver hier af, dan zit
// het probleem in de app en niet in de modellering.
function handH(metVoute) {
  const SIN5 = Math.sin(5 * Math.PI / 180);
  const Ls = 15000 / COS5, n = 4000, ds = Ls / n;
  const rhoG = RHO_STAAL * G * 1e-6 / 1000;               // kN/m per mm² doorsnede
  const qDak = 1.35 * 2.16 + 1.5 * 4.45;                  // 9,591 kN/m staaflengte
  const D = VOUTE_DOORSNEDEN;
  const sec = (s) => {
    if (!metVoute || s >= 2990) return { A: STEEL_SECTIONS["IPE450"].A, Iy: STEEL_SECTIONS["IPE450"].Iy };
    if (s <= 250) return { A: D[0].A, Iy: D[0].Iy };
    const u = (s - 250) / 685, i = Math.min(3, Math.floor(u)), f = u - i;
    return { A: D[i].A + f * (D[i + 1].A - D[i].A), Iy: D[i].Iy + f * (D[i + 1].Iy - D[i].Iy) };
  };
  const w = (s) => qDak + 1.35 * rhoG * sec(s).A;         // kN/m staaflengte, verticaal
  // Totale spantbeenlast en de verticale reactie in het hoofdsysteem
  let W = 0;
  for (let i = 0; i < n; i++) W += w((i + 0.5) * ds) * ds / 1000;
  W *= 2;
  const VA = W / 2;
  let teller = 0, noemer = 0;
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) * ds, x = s * COS5, z = 6000 + s * SIN5;
    let M0 = VA * x / 1000;                                // kNm
    const m = 200, dsig = s / m;
    for (let j = 0; j < m; j++) {
      const sg = (j + 0.5) * dsig;
      M0 -= w(sg) * (dsig / 1000) * ((x - sg * COS5) / 1000);
    }
    const EI = 210000 * sec(s).Iy;
    teller += (M0 * 1e6) * z * ds / EI;
    noemer += z * z * ds / EI;
  }
  teller *= 2; noemer *= 2;                                // beide spantbenen
  const nk = 4000, dz = 6000 / nk;                         // kolommen: M0 = 0
  for (let i = 0; i < nk; i++) {
    const z = (i + 0.5) * dz;
    noemer += 2 * z * z * dz / (210000 * STEEL_SECTIONS["IPE500"].Iy);
  }
  return teller / noemer / 1000;                           // kN
}
log("\n⑧ Onafhankelijke controle van de solver (krachtenmethode, geen FEM)");
log("─".repeat(112));
{
  const zEHF = meet(combineResults(
    { id: 2, name: "1,35G+1,5S", type: "uls", formula: "", factors: new Map([[1, 1.35], [2, 1.5]]) },
    solveAllCases(bouwInvoer({ voute: "geen" })).perCase));
  const zEHFt = meet(combineResults(
    { id: 2, name: "1,35G+1,5S", type: "uls", formula: "", factors: new Map([[1, 1.35], [2, 1.5]]) },
    solveAllCases(bouwInvoer({ voute: "taps" })).perCase));
  for (const [naam, hand, solver] of [
    ["kale doorsneden", handH(false), Math.abs(zEHF.H_L)],
    ["met voute      ", handH(true), Math.abs(zEHFt.H_L)],
  ]) {
    const d = (solver - hand) / hand * 100;
    log(`  H (${naam}): handafleiding ${hand.toFixed(2)} kN   solver ${solver.toFixed(2)} kN   ` +
        `Δ = ${d >= 0 ? "+" : ""}${d.toFixed(2)} %`);
  }
  log("  (combinatie zonder EHF, zodat het symmetrische geval van de handafleiding geldt;");
  log("   de handafleiding verwaarloost normaalkrachtvervorming, de solver niet — vandaar de restafwijking)");
}
log("─".repeat(112));

log("\n⑨ Referentiewaarden die NIET zijn nagerekend");
log("─".repeat(112));
const geenToetskern =
  "EN 1993-1-1-toetskern niet in deze build (geen command check_steel_beams in design-mockup/src-tauri)";
for (const [g, w, reden] of [
  ["Kolom IPE 500: doorsnedeklasse", "1", geenToetskern],
  ["Kolom: Nb,Rd (drie toetsingen)", "3 731 / 2 092 / 3 937 kN", geenToetskern],
  ["Kolom: Mb,Rd", "779 resp. 640 kNm", geenToetskern],
  ["Ligger: Nb,Rd / Mb,Rd", "3 034 / 2 238 / 2 175 kN; 581 kNm", geenToetskern],
  ["UC kolom uit het vlak (6.62)", "0,832 en 0,758", geenToetskern],
  ["UC kolom in het vlak (6.61)", "0,625", geenToetskern],
  ["UC ligger", "0,653 / 0,601 / 0,779", geenToetskern],
  ["Voute: drukkracht in de voutflens", "670 kN < 1 214 kN", "detailtoets van de voutflens; geen doorsnede- of raamwerkgrootheid"],
  ["Voute: VEd < 1 775 kN", "1 775 kN", "Av van de samengestelde voutedoorsnede staat niet in de bron"],
  ["Kolom, tweede tussenwaarde MEd", "221 kNm", "positie van die doorsnede staat niet in de bron (alleen grafisch)"],
  ["alpha_cr,s,est", "12,5", "de formule van de bron staat niet in het dossier; het model met 10 % voetstijfheid is bovendien niet in de app in te voeren"],
]) log(`  • ${g.padEnd(44)} ref ${String(w).padEnd(28)} — ${reden}`);
log("─".repeat(112));

// ── Samenvatting ─────────────────────────────────────────────────────────
function samenvat(naam, rijen) {
  const met = rijen.filter((r) => r.dev !== null && Number.isFinite(r.dev));
  const grootste = met.reduce((a, b) => (Math.abs(b.dev) > Math.abs(a.dev) ? b : a), met[0]);
  const boven2 = met.filter((r) => Math.abs(r.dev) > 2);
  log(`  ${naam}: ${met.length} vergelijkingen, grootste afwijking ` +
      `${grootste.dev >= 0 ? "+" : ""}${grootste.dev.toFixed(1)} % (${grootste.grootheid}), ` +
      `${boven2.length} boven 2 %`);
  return Math.max(...met.map((r) => Math.abs(r.dev)));
}
log("\n" + "═".repeat(112));
log("SAMENVATTING");
log("═".repeat(112));
const mKaal = samenvat("① app-model (kale doorsneden)", kaalRegels);
const mTaps = samenvat("② met voutestijfheid       ", tapsRegels);
const mHerl = samenvat("⑤ na correctie voor ΔH     ", herleidRegels);
const mForm = samenvat("⑥ gesloten formules        ", formuleRegels);
const mProf = samenvat("⑦ profieldata              ", profielRegels);
log("");
log(`  Grootste afwijking over alles wat nagerekend kon worden: ${Math.max(mKaal, mForm, mProf).toFixed(1)} %`);
log("  (variant ② is bewust NIET maatgevend: die stijfheidsverdeling is niet in de app in te voeren")
log("   en past bovendien slechter bij de bron dan het kale model — zie de bevindingen.)");
log("═".repeat(112) + "\n");
