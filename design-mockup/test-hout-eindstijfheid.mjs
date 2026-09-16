// Eindstijfheid E_mean,fin van hout in een gemengd, statisch onbepaald model
// (NEN-EN 1995-1-1 + NB, 2.2.2(1)P, 2.2.3(5), 2.3.2.2).
//
// WAT HIER BEWEZEN WORDT
//   [1] De bepaling: wanneer 2.2.3(5) niet geldt (hout naast staal, beton of
//       hout met een andere k_def, verende aansluitingen) en wanneer wel
//       (geen hout, één kruipgedrag, statisch bepaald); tweede orde en hout
//       zonder k_def geven een melding zonder doorrekening.
//   [2] De varianten: ψ₂-kandidaten per combinatie, id's en namen, geen BGT-
//       variant, en dezelfde lijst (dezelfde referentie) als 2.2.3(5) geldt.
//   [3] De HERVERDELING tegen de handberekening (zie hieronder).
//   [4] De omhullende neemt de ongunstigste variant.
//   [5] Bit-identiek: een zuiver houten model en een enkele houten ligger geven
//       met en zonder deze uitbreiding exact dezelfde resultaten.
//   [6] Een variant zonder doorgerekende eindtoestand is een fout, geen terugval.
//   [7] De tabel k_def in TypeScript is gelijk aan die van de rekenkern.
//   [8] De MCP-weg (sidecar `solve`): varianten in `combinations` en de meldingen
//       in `warnings`.
//
// ── HANDBEREKENING ──────────────────────────────────────────────────────────
// Ligger over twee velden A–B–C, elk L = 5000 mm, star doorgaand over B.
// Veld 1 (A–B): C24 100 × 300, E_mean = 11 000 N/mm² (EN 338),
//   I = 100·300³/12 = 2,25·10⁸ mm⁴ → EI₁ = 2,475·10¹² N·mm², klimaatklasse 1,
//   k_def = 0,60 (tabel 3.2).
// Veld 2 (B–C): IPE 200, E = 210 000, I_y = 19,4·10⁶ mm⁴ → EI₂ = 4,074·10¹².
// Opleggingen: A scharnier, B en C rol → n = 3·2 + 4 − 3·3 − 0 = 1.
// Belasting alleen op veld 1: G = 2 kN/m (blijvend), Q = 3 kN/m (categorie A,
//   ψ₂ = 0,3, NB tabel NB.2–A1.1).
//
// Hoekverdraaiing bij B gelijk (krachtenmethode, onbekende M_B):
//   qL³/(24·EI₁) − M_B·L/(3·EI₁) = M_B·L/(3·EI₂)
//   ⇒ M_B = (qL²/8) · EI₂ / (EI₁ + EI₂)
// In de eindtoestand EI₁ → s·EI₁ met s = 1/(1 + ψ₂·k_def) (2.3.2.2(2), 2.10).
//
//   qL²/8 = 3,125 kNm per kN/m.
//   1,2G + 1,5Q: q = 6,9 kN/m → qL²/8 = 21,5625 kNm
//     E_mean      s = 1        EI₂/(s·EI₁+EI₂) = 0,622080  M_B = 13,4136 kNm
//     ψ₂ = 0,3    s = 1/1,18   0,660136                    M_B = 14,2342 kNm
//     ψ₂ = 1      s = 1/1,60   0,724798                    M_B = 15,6285 kNm
//   1,35G: q = 2,7 kN/m → qL²/8 = 8,4375 kNm
//     E_mean  M_B = 5,2488;  ψ₂ = 1  M_B = 6,1155 kNm
//
// Het houtveld kruipt weg en het STAAL neemt het steunpuntsmoment over: +16,5 %
// bij ψ₂ = 1. Met alleen E_mean was het staalveld dus te licht getoetst.
//
// Draaien met: npx tsx test-hout-eindstijfheid.mjs
//         of : node scripts/run-tests.mjs --filter=hout-eindstijfheid

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const {
  combineResults, computeEnvelope, getEindtoestandGevallen, EINDTOESTAND_COMBO_OFFSET,
} = await import("./src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const {
  bepaalEindstijfheidHout, metEindtoestandVarianten, losEindtoestandOp, eindtoestandKandidaten,
  psi2VoorEindstijfheid, K_DEF_TABEL_3_2,
} = await import("./src/lib/houtEindstijfheid.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");

let passed = 0, failed = 0;
const log = (s = "") => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
}
function dicht(naam, gemeten, verwacht, tolAbs) {
  ok(naam, Number.isFinite(gemeten) && Math.abs(gemeten - verwacht) <= tolAbs,
    `${Number(gemeten).toFixed(4)} vs ${verwacht.toFixed(4)}`);
}

// ── Handwaarden ─────────────────────────────────────────────────────────────
const L = 5000;
const EI1 = 11000 * (100 * 300 ** 3) / 12;
const EI2 = 210000 * 19.4e6;
const MB = (qKnPerM, s) => (qKnPerM * L * L / 8) / 1e6 * EI2 / (s * EI1 + EI2);
dicht("hand: M_B 1,2G+1,5Q met E_mean = 13,4136", MB(6.9, 1), 13.4136, 5e-4);
dicht("hand: M_B 1,2G+1,5Q ψ₂ = 0,3 = 14,2342", MB(6.9, 1 / 1.18), 14.2342, 5e-4);
dicht("hand: M_B 1,2G+1,5Q ψ₂ = 1 = 15,6285", MB(6.9, 1 / 1.6), 15.6285, 5e-4);
dicht("hand: M_B 1,35G ψ₂ = 1 = 6,1155", MB(2.7, 1 / 1.6), 6.1155, 5e-4);

// ── Modellen ────────────────────────────────────────────────────────────────
const GEVALLEN = [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q", type: "live", categorie: "A" }];
const COMBOS = () => [
  { id: 1, name: "1,2G+1,5Q", type: "uls", formula: "", factors: new Map([[1, 1.2], [2, 1.5]]) },
  { id: 2, name: "1,35G", type: "uls", formula: "", factors: new Map([[1, 1.35]]) },
  { id: 3, name: "G+Q kar.", type: "sls", formula: "", factors: new Map([[1, 1], [2, 1]]) },
];

function tweeVelden({ veld1 = { material: "C24", profile: "100x300" }, veld2 = { material: "S235", profile: "IPE 200" }, extra = {} } = {}) {
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }, { id: 3, x: 2 * L, z: 0 }],
    beams: [
      { id: 1, from: 1, to: 2, ...veld1 },
      { id: 2, from: 2, to: 3, ...veld2 },
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 3, type: "zRoller" }],
    plates: [],
    loadCases: GEVALLEN,
    loads: [
      { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -2 },
      { id: 2, type: "lineLoad", caseId: 2, beamId: 1, q: -3 },
    ],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
    analysetype: "eersteOrde",
    ...extra,
  };
}

/** De app-gang: bepalen, varianten, solve, eindtoestand, combineren. */
function reken(m) {
  const uitkomst = bepaalEindstijfheidHout(m);
  const combos = metEindtoestandVarianten(COMBOS(), m.loadCases, uitkomst);
  const input = bouwMultiInput(m);
  const { perCase } = solveAllCases(input);
  losEindtoestandOp(input, perCase, combos, uitkomst);
  const res = new Map(combos.map((c) => [c.id, combineResults(c, perCase)]));
  return { uitkomst, combos, perCase, res, envelope: computeEnvelope(combos, perCase) };
}

/** De gang van vóór deze uitbreiding: solve en combineren, niets anders. */
function rekenOud(m, combos = COMBOS()) {
  const { perCase } = solveAllCases(bouwMultiInput(m));
  return { perCase, res: new Map(combos.map((c) => [c.id, combineResults(c, perCase)])), envelope: computeEnvelope(combos, perCase) };
}

const alsJson = (x) => JSON.stringify(x, (_k, v) => (v instanceof Map ? [...v.entries()] : v));
const mB = (res, id) => Math.abs(res.get(id).elements.get(1).M_end) / 1e6;

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De bepaling");
{
  const u = bepaalEindstijfheidHout(tweeVelden());
  ok("hout + staal, onbepaald (n = 1) → doorrekenen", u.status === "doorrekenen", u.reden);
  ok("graad 1", u.onbepaaldheid?.graad === 1);
  ok("k_def per houtstaaf: staaf 1 → 0,6, staaf 2 niet", u.kDefPerStaaf.get(1) === 0.6 && !u.kDefPerStaaf.has(2));
  ok("twee meldingen: UGT doorgerekend en BGT niet",
    u.meldingen.length === 2 &&
    u.meldingen[0].tekst.startsWith("Eindstijfheid hout doorgerekend (UGT).") &&
    u.meldingen[1].tekst.startsWith("Eindstijfheid hout niet doorgerekend (BGT).") &&
    u.meldingen.every((x) => x.caseId === null && x.niveau === "waarschuwing"));
  ok("de melding noemt 2.2.3(5), 2.10 en de delen", /2\.2\.3\(5\)/.test(u.meldingen[0].tekst) && /2\.10/.test(u.meldingen[0].tekst) && /staaf 1/.test(u.meldingen[0].tekst) && /staaf 2/.test(u.meldingen[0].tekst));

  const scharnier = tweeVelden({ veld1: { material: "C24", profile: "100x300", releases: { endRy: true } } });
  const us = bepaalEindstijfheidHout(scharnier);
  ok("zelfde model met scharnier in B → statisch bepaald → nvt, geen melding", us.status === "nvt" && us.meldingen.length === 0, us.reden);

  const zuiverHout = bepaalEindstijfheidHout(tweeVelden({ veld2: { material: "GL24h", profile: "100x300" } }));
  ok("massief + gelamineerd hout, beide klimaatklasse 1 → één kruipgedrag → nvt", zuiverHout.status === "nvt" && zuiverHout.meldingen.length === 0, zuiverHout.reden);

  const klimaat = bepaalEindstijfheidHout(tweeVelden({ veld2: { material: "C24", profile: "100x300", checkConfig: { serviceClass: 2 } } }));
  ok("hout klimaatklasse 1 naast klimaatklasse 2 (k_def 0,6 / 0,8) → doorrekenen",
    klimaat.status === "doorrekenen" && klimaat.kDefPerStaaf.get(1) === 0.6 && klimaat.kDefPerStaaf.get(2) === 0.8);

  const clt = bepaalEindstijfheidHout(tweeVelden({ veld2: { material: "C24", profile: "CLT 40/20/40/20/40" } }));
  ok("kruislaaghout zonder k_def → alleen melding, geen doorrekening", clt.status === "alleenMelding" && /k_def niet bekend/.test(clt.meldingen[0]?.tekst ?? ""), clt.reden);
  const cltMet = bepaalEindstijfheidHout(tweeVelden({ veld2: { material: "C24", profile: "CLT 40/20/40/20/40", checkConfig: { cltKdef: 0.6, cltKdefBron: "ETA" } } }));
  ok("kruislaaghout met k_def = 0,6 naast C24 klimaatklasse 1 → één kruipgedrag → nvt", cltMet.status === "nvt", cltMet.reden);

  const tweede = bepaalEindstijfheidHout(tweeVelden({ extra: { analysetype: "tweedeOrdeGeometrisch" } }));
  ok("tweede orde → alleen melding (2.2.2(1)P derde streepje)", tweede.status === "alleenMelding" && /derde streepje/.test(tweede.meldingen[0]?.tekst ?? ""));

  const enkel = tweeVelden();
  enkel.nodes = enkel.nodes.slice(0, 2); enkel.beams = enkel.beams.slice(0, 1); enkel.supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];
  const ue = bepaalEindstijfheidHout(enkel);
  ok("enkele houten ligger → nvt", ue.status === "nvt" && ue.meldingen.length === 0, ue.reden);

  const beton = bepaalEindstijfheidHout(tweeVelden({ veld2: { material: "C30/37", profile: "300x500" } }));
  ok("hout + beton → doorrekenen, met de kanttekening dat beton E_cm houdt",
    beton.status === "doorrekenen" && /Beton houdt in de eindtoestand E_cm/.test(beton.meldingen[0].tekst));

  const veren = bepaalEindstijfheidHout(tweeVelden({
    veld1: { material: "C24", profile: "100x300" },
    veld2: { material: "C24", profile: "100x300", veren: { startRy: 500 } },
  }));
  ok("zuiver hout met een verende aansluiting (k_def verbinding = 1,2, 2.3.2.2(3)) → doorrekenen",
    veren.status === "doorrekenen" && veren.groepen.some((g) => g.sleutel === "hout:1.2" && g.verbindingen.includes(2)));

  const geenHout = bepaalEindstijfheidHout(tweeVelden({ veld1: { material: "C30/37", profile: "300x500" } }));
  ok("staal + beton zonder hout → nvt", geenHout.status === "nvt" && geenHout.meldingen.length === 0);

  const vrij = bepaalEindstijfheidHout(tweeVelden({ veld2: { material: "VRIJ:steen E=20000 rho=2000 f=5", profile: "100x300" } }));
  ok("hout + vrij materiaal → doorrekenen, vrij materiaal houdt zijn E (gemeld)",
    vrij.status === "doorrekenen" && /Vrij of niet herkend materiaal houdt zijn opgegeven E/.test(vrij.meldingen[0].tekst), vrij.reden);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] ψ₂ en de varianten");
{
  ok("ψ₂: blijvend 1, cat. A 0,3, cat. E 0,8, sneeuw 0, wind 0, overig 1",
    psi2VoorEindstijfheid({ type: "dead" }) === 1 && psi2VoorEindstijfheid({ type: "live" }) === 0.3 &&
    psi2VoorEindstijfheid({ type: "live", categorie: "E" }) === 0.8 && psi2VoorEindstijfheid({ type: "snow" }) === 0 &&
    psi2VoorEindstijfheid({ type: "wind" }) === 0 && psi2VoorEindstijfheid({ type: "other" }) === 1);
  const [c1, c2] = COMBOS();
  ok("kandidaten 1,2G+1,5Q = [0,3; 1]", alsJson(eindtoestandKandidaten(c1, GEVALLEN)) === "[0.3,1]");
  ok("kandidaten 1,35G = [1]", alsJson(eindtoestandKandidaten(c2, GEVALLEN)) === "[1]");
  const metWind = { id: 9, name: "w", type: "uls", formula: "", factors: new Map([[4, 1.5]]) };
  ok("alleen wind → geen kandidaat (E_mean,fin = E_mean)", eindtoestandKandidaten(metWind, [{ id: 4, type: "wind" }]).length === 0);

  const u = bepaalEindstijfheidHout(tweeVelden());
  const lijst = metEindtoestandVarianten(COMBOS(), GEVALLEN, u);
  ok("3 combinaties → 6: twee varianten voor combinatie 1, één voor 2, geen voor de BGT", lijst.length === 6);
  ok("volgorde en id's",
    alsJson(lijst.map((c) => c.id)) === alsJson([1, 1 + 30 * EINDTOESTAND_COMBO_OFFSET, 1 + 100 * EINDTOESTAND_COMBO_OFFSET, 2, 2 + 100 * EINDTOESTAND_COMBO_OFFSET, 3]));
  ok("naam en kenmerk", lijst[1].name === "1,2G+1,5Q (eindtoestand ψ₂ = 0,3)" && lijst[1].eindtoestand?.psi2 === 0.3 && lijst[1].factors === lijst[0].factors);
  ok("grootste id past in een u32 van de rekenkern", Math.max(...lijst.map((c) => c.id)) < 2 ** 32);

  const nvt = { status: "nvt" };
  const orig = COMBOS();
  ok("nvt → dezelfde lijst (dezelfde referentie)", metEindtoestandVarianten(orig, GEVALLEN, nvt) === orig);
  ok("alleenMelding → dezelfde lijst", metEindtoestandVarianten(orig, GEVALLEN, { status: "alleenMelding" }) === orig);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] De herverdeling tegen de handberekening");
{
  const r = reken(tweeVelden());
  const off = EINDTOESTAND_COMBO_OFFSET;
  dicht("1,2G+1,5Q met E_mean: M_B = 13,4136 kNm", mB(r.res, 1), MB(6.9, 1), 1e-3);
  dicht("1,2G+1,5Q eindtoestand ψ₂ = 0,3: M_B = 14,2342 kNm", mB(r.res, 1 + 30 * off), MB(6.9, 1 / 1.18), 1e-3);
  dicht("1,2G+1,5Q eindtoestand ψ₂ = 1: M_B = 15,6285 kNm", mB(r.res, 1 + 100 * off), MB(6.9, 1 / 1.6), 1e-3);
  dicht("1,35G met E_mean: M_B = 5,2488 kNm", mB(r.res, 2), MB(2.7, 1), 1e-3);
  dicht("1,35G eindtoestand ψ₂ = 1: M_B = 6,1155 kNm", mB(r.res, 2 + 100 * off), MB(2.7, 1 / 1.6), 1e-3);
  // Het staalveld draagt hetzelfde steunpuntsmoment (evenwicht in knoop B).
  dicht("staalveld: M bij B = houtveld (ψ₂ = 1)", Math.abs(r.res.get(1 + 100 * off).elements.get(2).M_start) / 1e6, MB(6.9, 1 / 1.6), 1e-3);
  // De reactie in C: M_B/L naar beneden-gericht trekken → |R_C| = M_B/L.
  dicht("reactie C = M_B / L (ψ₂ = 1)", Math.abs(r.res.get(1 + 100 * off).reactions.get(3).fz) / 1e3, MB(6.9, 1 / 1.6) / 5, 1e-3);
  ok("BGT-combinatie ongewijzigd (geen variant, E_mean)", dicht2(mB(r.res, 3), MB(5, 1)));
  const fin = getEindtoestandGevallen(r.perCase, 1);
  ok("eindtoestand ψ₂ = 1 hangt aan perCase; ψ₂ = 0 niet", fin !== undefined && getEindtoestandGevallen(r.perCase, 0) === undefined);
}
function dicht2(a, b) { return Math.abs(a - b) <= 1e-3; }

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] De omhullende neemt de ongunstigste");
{
  const r = reken(tweeVelden());
  const e = r.envelope.elements.get(2);
  const maxM = Math.max(Math.abs(e.M_min), Math.abs(e.M_max)) / 1e6;
  dicht("omhullende staalveld: |M|max = 15,6285 kNm (eindtoestand ψ₂ = 1)", maxM, MB(6.9, 1 / 1.6), 1e-3);
  ok("maatgevende combinatie = de variant", e.governingCombinationId === 1 + 100 * EINDTOESTAND_COMBO_OFFSET, String(e.governingCombinationId));
  const oud = rekenOud(tweeVelden()).envelope.elements.get(2);
  dicht("zonder eindtoestand was dat 13,4136 kNm", Math.max(Math.abs(oud.M_min), Math.abs(oud.M_max)) / 1e6, MB(6.9, 1), 1e-3);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Bit-identiek bij één kruipgedrag en bij een enkel element");
{
  for (const [naam, m] of [
    ["zuiver houten doorgaande ligger (C24 + GL24h, klimaatklasse 1)", tweeVelden({ veld2: { material: "GL24h", profile: "100x300" } })],
    ["enkele houten ligger", (() => {
      const e = tweeVelden();
      e.nodes = e.nodes.slice(0, 2); e.beams = e.beams.slice(0, 1);
      e.supports = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }];
      return e;
    })()],
    ["gemengd maar statisch bepaald (scharnier in B)", tweeVelden({ veld1: { material: "C24", profile: "100x300", releases: { endRy: true } } })],
  ]) {
    const nieuw = reken(m);
    const oud = rekenOud(m);
    ok(`${naam}: combinaties ongewijzigd`, nieuw.combos.length === 3);
    ok(`${naam}: combinatieresultaten bit-identiek`, alsJson(nieuw.res) === alsJson(oud.res));
    ok(`${naam}: omhullende bit-identiek`, alsJson(nieuw.envelope) === alsJson(oud.envelope));
    ok(`${naam}: geen eindtoestand aan perCase`, getEindtoestandGevallen(nieuw.perCase, 1) === undefined && getEindtoestandGevallen(nieuw.perCase, 0.3) === undefined);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Een variant zonder eindtoestand is een fout");
{
  const u = bepaalEindstijfheidHout(tweeVelden());
  const combos = metEindtoestandVarianten(COMBOS(), GEVALLEN, u);
  const { perCase } = solveAllCases(bouwMultiInput(tweeVelden()));
  let fout = null;
  try { combineResults(combos[1], perCase); } catch (e) { fout = String(e.message); }
  ok("combineResults gooit met een Nederlandse reden", fout !== null && /niet doorgerekend/.test(fout), fout ?? "geen fout");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] k_def gelijk aan de rekenkern (factors.rs, tabel 3.2)");
{
  const rs = readFileSync(join(REPO, "src-tauri", "crates", "nen-en-1995-1-1", "src", "factors.rs"), "utf8");
  const blok = /pub fn k_def[\s\S]*?\n\}/.exec(rs)?.[0] ?? "";
  const waarde = (sc) => Number(new RegExp(`ServiceClass::Sc${sc}\\s*=>\\s*([0-9.]+)`).exec(blok)?.[1]);
  for (const sc of [1, 2, 3]) {
    ok(`klimaatklasse ${sc}: ${K_DEF_TABEL_3_2[sc]} = ${waarde(sc)}`, K_DEF_TABEL_3_2[sc] === waarde(sc));
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] De MCP-weg (sidecar `solve`)");
{
  const m = tweeVelden();
  const model = {
    nodes: m.nodes, beams: m.beams, supports: m.supports, loadCases: m.loadCases, loads: m.loads,
  };
  const combinaties = COMBOS().map((c) => ({ id: c.id, name: c.name, type: c.type, formula: "", factors: Object.fromEntries(c.factors) }));
  const antwoord = verwerkVerzoek({ id: 1, op: "solve", payload: { model, combinations: combinaties } });
  const r = antwoord.result ?? antwoord.resultaat ?? antwoord;
  const combos = r.combinations ?? {};
  const sleutel = String(1 + 100 * EINDTOESTAND_COMBO_OFFSET);
  ok("variant 1,2G+1,5Q ψ₂ = 1 in `combinations`", combos[sleutel] !== undefined, Object.keys(combos).join(","));
  const w = r.warnings ?? [];
  ok("meldingen in `warnings`", w.some((x) => x.startsWith("Eindstijfheid hout doorgerekend (UGT).")) && w.some((x) => x.startsWith("Eindstijfheid hout niet doorgerekend (BGT).")), w.join(" | ").slice(0, 300));
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
if (failed > 0) process.exit(1);
