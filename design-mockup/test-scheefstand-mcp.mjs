// De MCP-weg rekent de scheefstand met dezelfde normkeuze als de app
// (basisaudit nr 19).
//
// WAAROM DEZE TEST BESTAAT
// Tot september 2026 las de sidecar uit een projectbestand alleen
// scheefstand aan/uit, de ingetikte noemer en de richting. De normkeuze
// (`scheefstandBron`), de hoogte en het aantal kolommen bleven liggen. De
// app rekende met de normnoemer, de MCP-weg met de ingetikte — hetzelfde
// bestand gaf zo twee verschillende horizontale krachten, zonder waarschuwing:
//
//   | situatie                          | app     | MCP   | H_MCP / H_app |
//   | h = 5 m, en1993, noemer 200       | 1/258,2 | 1/200 | 1,29          |
//   | h = 5 m, en1992, noemer 200       | 1/387,3 | 1/200 | 1,94          |
//   | h = 9 m, en1993, noemer 200       | 1/346,4 | 1/200 | 1,73          |
//   | eerder 1/500 ingetikt, en1993     | 1/258,2 | 1/500 | 0,52          |
//   | eerder 1/500 ingetikt, en1995     | 1/200   | 1/500 | 0,40          |
//
// De verwachte noemers zijn hier LETTERLIJK uitgeschreven uit de normformules
// en niet uit `lib/scheefstandNorm` geïmporteerd: deze test draait óók tegen
// de sidecarbundel, en juist daar moet blijken dat de bundel dezelfde
// afleiding meedraagt als de app.
//   EN 1993-1-1 (5.5):  φ = φ₀·α_h·α_m, φ₀ = 1/200, α_h = 2/√h (⅔ ≤ α_h ≤ 1),
//                       α_m = √(0,5·(1 + 1/m));
//   EN 1992-1-1 (5.1):  θ_i = θ₀·α_h·α_m met θ₀ = 1/300 (NB), α_h = 2/√l
//                       (⅔ ≤ α_h ≤ 1), α_m = √(0,5·(1 + 1/m));
//   EN 1995-1-1 (5.1):  φ = 0,005 voor h ≤ 5 m → 1/200.
// Portaal met twee kolommen: m = 2, α_m = √0,75 = 0,8660.
//
// Draaien met: npx tsx test-scheefstand-mcp.mjs   (ook tegen de bundel)

const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const { serializeProject } = await import("./src/io/projectFile.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
function dichtbij(naam, gemeten, verwacht, tolPct = 0.05) {
  const afw = Math.abs(gemeten / verwacht - 1) * 100;
  ok(naam, Number.isFinite(gemeten) && afw <= tolPct, `${gemeten.toFixed(2)} (verwacht ${verwacht.toFixed(2)}, ${afw.toFixed(3)} %)`);
}

const ALPHA_M2 = Math.sqrt(0.5 * (1 + 1 / 2));
const alphaH = (h) => Math.min(1, Math.max(2 / 3, 2 / Math.sqrt(h)));
const NOEMER = {
  en1993: (h) => 200 / (alphaH(h) * ALPHA_M2),
  en1992: (h) => 300 / (alphaH(h) * ALPHA_M2),
  en1995: () => 200,
};

function portaal(hMm) {
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: hMm }, { id: 3, x: 6000, z: hMm }, { id: 4, x: 6000, z: 0 }],
    beams: [
      { id: 1, from: 1, to: 2, material: "S235", profile: "HEA 160" },
      { id: 2, from: 2, to: 3, material: "S235", profile: "HEA 160" },
      { id: 3, from: 3, to: 4, material: "S235", profile: "HEA 160" },
    ],
    supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "fixed" }],
    loadCases: [{ id: 1, name: "G", type: "dead" }],
    loads: [
      { id: 1, type: "pointForce", nodeId: 2, fz: -100, caseId: 1 },
      { id: 2, type: "pointForce", nodeId: 3, fz: -100, caseId: 1 },
    ],
  };
}

const vraag = (op, payload) => verwerkVerzoek({ v: 1, id: 1, op, payload });

/** De gerekende noemer 1/φ uit de reacties van de eerste combinatie. */
function noemerUit(antwoord) {
  const combos = antwoord.result?.combinations ?? {};
  const eerste = combos[Object.keys(combos)[0]];
  let fx = 0, fz = 0;
  for (const r of Object.values(eerste?.reactions ?? {})) { fx += r.fx; fz += r.fz; }
  return Math.abs(fz / fx);
}

function projectInhoud(hMm, bron, noemer, extra = {}) {
  return serializeProject({
    ...portaal(hMm), plates: [], activeLoadCaseId: 1, selfWeightEnabled: false,
    nonlinearEnabled: false, analysetype: "eersteOrde",
    combinations: [{ id: 1, name: "C", type: "uls", formula: "G", factors: { 1: 1 } }],
    scheefstandEnabled: true, scheefstandNoemer: noemer, scheefstandRichting: 1,
    scheefstandBron: bron, scheefstandHoogteM: null, scheefstandAantalElementen: null,
    ...extra,
  });
}

log("\n[1] Projectbestand: de normkeuze uit het bestand telt, zoals in de app");
{
  const gevallen = [
    [5000, "en1993", 200, NOEMER.en1993(5)],
    [5000, "en1992", 200, NOEMER.en1992(5)],
    [9000, "en1993", 200, NOEMER.en1993(9)],
    [5000, "vast", 200, 200],
    // Bereikbaar in de UI: eerst 'vast' met 1/500 ingetikt, dan een norm gekozen.
    [5000, "en1993", 500, NOEMER.en1993(5)],
    [5000, "en1995", 500, NOEMER.en1995()],
    // "ongunstigste": alleen EN 1993 is op een staalportaal van toepassing.
    [5000, "ongunstigste", 500, NOEMER.en1993(5)],
  ];
  for (const [h, bron, noemer, verwacht] of gevallen) {
    const a = vraag("solve", { project: { inhoud: projectInhoud(h, bron, noemer) } });
    ok(`h = ${h / 1000} m, ${bron}, noemer ${noemer}: solve slaagt`, a.ok === true, a.error?.melding ?? "");
    if (a.ok !== true) continue;
    dichtbij(`  gerekende noemer 1/φ`, noemerUit(a), verwacht);
    const meldt = (a.result.warnings ?? []).some((w) => /^Scheefstand: φ = 1\//.test(w));
    ok(`  warnings ${bron === "vast" ? "zwijgen (vaste noemer)" : "noemen de gerekende φ en de norm"}`,
      bron === "vast" ? !meldt : meldt, (a.result.warnings ?? []).filter((w) => /Scheefstand/.test(w)).join(" | "));
  }
}

log("\n[2] Zonder `scheefstandBron` (bestand van vóór de normkeuze): exact 1/noemer");
{
  const inhoud = serializeProject({
    ...portaal(5000), plates: [], activeLoadCaseId: 1, selfWeightEnabled: false,
    nonlinearEnabled: false, analysetype: "eersteOrde",
    combinations: [{ id: 1, name: "C", type: "uls", formula: "G", factors: { 1: 1 } }],
    scheefstandEnabled: true, scheefstandNoemer: 250, scheefstandRichting: 1,
  });
  const a = vraag("solve", { project: { inhoud } });
  ok("solve slaagt", a.ok === true, a.error?.melding ?? "");
  dichtbij("noemer = 250 (tot op de bit: geen normafleiding)", noemerUit(a), 250, 1e-9);
  ok("geen scheefstandmelding", !(a.result?.warnings ?? []).some((w) => /Scheefstand/.test(w)));
}

log("\n[3] Los model (`model`): dezelfde drie velden, dezelfde afleiding");
{
  const model = { ...portaal(5000), plates: [], scheefstandEnabled: true, scheefstandNoemer: 200,
    scheefstandRichting: 1, scheefstandBron: "en1993", scheefstandHoogteM: null, scheefstandAantalElementen: null };
  const v = vraag("validate", { model });
  ok("validate accepteert de drie velden", v.ok === true && v.result?.ok === true, JSON.stringify(v.result?.errors ?? v.error));
  const a = vraag("solve", { model });
  ok("solve slaagt", a.ok === true, a.error?.melding ?? "");
  dichtbij("noemer 1/258,2 zoals de app", noemerUit(a), NOEMER.en1993(5));

  // Handmatige h en m overschrijven de afleiding: h = 9 m, m = 4.
  const hand = { ...model, scheefstandHoogteM: 9, scheefstandAantalElementen: 4 };
  const b = vraag("solve", { model: hand });
  ok("solve met handmatige h en m slaagt", b.ok === true, b.error?.melding ?? "");
  dichtbij("h = 9 m, m = 4 → 1/(200 / (⅔·√0,625))", noemerUit(b), 200 / ((2 / 3) * Math.sqrt(0.5 * (1 + 1 / 4))));
}

log("\n[4] Weigeren, niet stil terugvallen");
{
  const model = { ...portaal(5000), plates: [], scheefstandEnabled: true, scheefstandNoemer: 200,
    scheefstandRichting: 1, scheefstandBron: "en1990" };
  const a = vraag("solve", { model });
  ok("onbekende bron → geweigerd", a.ok === false, JSON.stringify(a.result?.warnings ?? ""));
  ok("melding noemt de bron en de bekende waarden", /en1990/.test(a.error?.melding ?? "") && /"en1993"/.test(a.error?.melding ?? ""), a.error?.melding ?? "");
  // `validate` leest het model met dezelfde poort als `solve` en weigert dus
  // ook al bij het lezen (zoals bij een losse E/A/I op een staaf); de
  // veldcontrole van `valideerModel` zelf noemt het veld ook.
  const v = vraag("validate", { model });
  ok("validate weigert de onbekende bron met dezelfde melding", v.ok === false && /scheefstandBron/.test(v.error?.melding ?? ""), v.error?.melding ?? JSON.stringify(v.result));
  const { valideerModel } = await import("./src/mcp/valideerModel.ts");
  const u = valideerModel(model);
  ok("valideerModel noemt model.scheefstandBron als fout", u.ok === false && u.errors.some((e) => /model\.scheefstandBron/.test(e)), JSON.stringify(u.errors));

  const hFout = { ...model, scheefstandBron: "en1993", scheefstandHoogteM: -2 };
  const c = vraag("solve", { model: hFout });
  ok("hoogte ≤ 0 → geweigerd", c.ok === false && /scheefstandHoogteM/.test(c.error?.melding ?? ""), c.error?.melding ?? "");
  const mFout = { ...model, scheefstandBron: "en1993", scheefstandAantalElementen: 1.5 };
  const d = vraag("solve", { model: mFout });
  ok("aantal elementen niet geheel → geweigerd", d.ok === false && /scheefstandAantalElementen/.test(d.error?.melding ?? ""), d.error?.melding ?? "");

  // Ook in een projectbestand: een onbekende bron is geen reden om stil met
  // de vaste noemer te rekenen.
  const p = vraag("solve", { project: { inhoud: projectInhoud(5000, "en1990", 200) } });
  ok("projectbestand met onbekende bron → geweigerd", p.ok === false && /en1990/.test(p.error?.melding ?? ""), p.error?.melding ?? "");
}

log("\n[5] load_project geeft de gerekende noemer én de keuze terug");
{
  const a = vraag("load_project", { inhoud: projectInhoud(5000, "en1993", 200), path: "x.ifcfem2d" });
  ok("load_project slaagt", a.ok === true, a.error?.melding ?? "");
  dichtbij("model.scheefstandNoemer = gerekende noemer", a.result?.model?.scheefstandNoemer ?? NaN, NOEMER.en1993(5));
  ok("model.scheefstandBron = en1993", a.result?.model?.scheefstandBron === "en1993");
  ok("warnings noemen de scheefstand", (a.result?.warnings ?? []).some((w) => /^Scheefstand: φ/.test(w)));
  // En terug: het geladen model kan zo weer de solve in, met dezelfde φ.
  const terug = vraag("solve", { model: a.result.model });
  ok("model uit load_project rekent opnieuw door", terug.ok === true, terug.error?.melding ?? "");
  dichtbij("  met dezelfde noemer", noemerUit(terug), NOEMER.en1993(5));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
