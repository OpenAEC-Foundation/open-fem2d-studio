// Het bedieningskanaal wacht nooit op een render die niet komt (issue #28).
//
// ── WAAROM DEZE TEST BESTAAT ───────────────────────────────────────────────
//
// `gui_set_view` naar de weergave die al actief was, wachtte 30 s en gaf dan
// "geen antwoord van de pagina". Oorzaak: `weergave_zetten` in
// src/bediening/bediening.ts riep `setActiveView(v)` aan en wachtte met
// `wachtOpRender` op de eerstvolgende commit. React slaat gelijke state over;
// was `v` al actief, dan kwam er geen commit en bleef de belofte open tot de
// time-out van Rust. `staaf_selecteren` en `analysetype_zetten` hadden
// dezelfde constructie.
//
// De reparatie: elke actie wacht op `verseRender` (een eigen tik die altijd
// commit). Deze test speelt dat na zonder app:
//
//   [1] gedrag  — `voerUit` met nagebootste acties en een `wachtOpRender` die
//                 NOOIT inlost (precies wat React doet als er niets
//                 verandert). Elke opdracht die niets verandert moet toch
//                 binnen korte tijd terugkomen, met de huidige toestand.
//   [2] bron    — in `voerUit` staat geen `await wachtOpRender()` meer, en
//                 `verseRender` zet echt een tik (anders zou [1] een
//                 nabootsing toetsen die de app niet doet).
//
// Uitvoeren: npx tsx test-bediening-wachten.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=bediening-wachten

import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));

// bediening.ts trekt via de rapportmodules stylesheets (KaTeX) mee; Node kent
// die niet. Een lege module volstaat: hier wordt geen opmaak gelezen.
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function load(url, ctx, next) {" +
        " if (url.split('?')[0].endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };" +
        " return next(url, ctx); }",
    ),
);
const { voerUit } = await import("./src/bediening/bediening.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

// ── [1] gedrag ──────────────────────────────────────────────────────────────
log("\n[1] opdrachten die niets veranderen komen direct terug");

/** Nagebootste acties: een raamwerk met één staaf, weergave "default". */
function maakActies() {
  const staaf = { id: 1, nodeIds: [1, 2], material: "C30/37", checkConfig: {} };
  const toestand = { activeView: "default", selection: { type: "beam", id: 1 } };
  const fem = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [staaf],
    loads: [],
    loadCases: [],
    combinations: [],
    combinationResults: null,
    analysetype: "eersteOrde",
    addNode: () => 99,
    addBeam: () => 99,
    updateBeam: (id, u) => { if (id === staaf.id) Object.assign(staaf, u); },
    addSupport: () => {},
    addLoad: () => {},
    addLoadCase: () => {},
    setAnalysetype: (v) => { fem.analysetype = v; },
  };
  const acties = {
    fem,
    get activeView() { return toestand.activeView; },
    get selection() { return toestand.selection; },
    setSelection: (s) => { toestand.selection = s; },
    setActiveView: (v) => { toestand.activeView = v; },
    setBottomPanelOpen: () => {},
    handleRunMemberChecks: async () => {},
    rekenDoor: async () => ({ gelukt: true, fysisch: "nvt" }),
    rekenToestand: () => ({ herberekeningGepland: false, lopendeRekengangen: 0, generatie: 0, volledigeRekengang: null }),
    laatsteRekenfout: () => null,
    createDetachedWindow: async () => "los",
    laadProjectTekst: async () => {},
  };
  return acties;
}

// Een render die nooit komt: zo gedraagt React zich als de state niet wijzigt.
const nooit = () => new Promise(() => {});
let tikken = 0;
const vers = () => { tikken++; return Promise.resolve(); };

const GRENS_MS = 2000;
async function binnenGrens(naam, args, acties) {
  let timer;
  const verlopen = new Promise((los) => { timer = setTimeout(() => los("VERLOPEN"), GRENS_MS); });
  try {
    const uitkomst = await Promise.race([
      voerUit(naam, args, { current: acties }, nooit, vers),
      verlopen,
    ]);
    return uitkomst;
  } catch (err) {
    return { fout: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

{
  const a = maakActies();
  const t0 = tikken;
  const u = await binnenGrens("weergave_zetten", { view: "default" }, a);
  check("weergave_zetten naar de al actieve weergave komt terug (was: 30 s en een fout)",
    u !== "VERLOPEN" && u?.weergave === "default", JSON.stringify(u));
  check("… en heeft zelf een render geforceerd", tikken > t0);

  const u2 = await binnenGrens("weergave_zetten", { view: "check" }, a);
  check("weergave_zetten naar een andere weergave komt terug met die weergave",
    u2 !== "VERLOPEN" && u2?.weergave === "check", JSON.stringify(u2));
}
{
  const a = maakActies();
  const u = await binnenGrens("staaf_selecteren", { id: 1 }, a);
  check("staaf_selecteren van de al geselecteerde staaf komt terug",
    u !== "VERLOPEN" && u?.id === 1, JSON.stringify(u));
}
{
  const a = maakActies();
  const u = await binnenGrens("analysetype_zetten", { analysetype: "eersteOrde" }, a);
  check("analysetype_zetten naar het huidige analysetype komt terug",
    u !== "VERLOPEN" && u?.analysetype === "eersteOrde", JSON.stringify(u));
}
{
  const a = maakActies();
  const u = await binnenGrens("model_bouwen", {}, a);
  check("model_bouwen zonder iets toe te voegen komt terug",
    u !== "VERLOPEN" && Array.isArray(u?.nodeIds) && u.nodeIds.length === 0, JSON.stringify(u));
}
{
  const a = maakActies();
  const u = await binnenGrens("model_laden", { tekst: "{}" }, a);
  check("model_laden (asynchroon) komt terug",
    u !== "VERLOPEN" && u?.aantalStaven === 1, JSON.stringify(u));
}
{
  const a = maakActies();
  const korf = { naam: "proef" };
  const u = await binnenGrens("korf_zetten", { beamId: 1, korf }, a);
  const u2 = await binnenGrens("korf_zetten", { beamId: 1, korf }, a);
  check("korf_zetten, ook twee keer dezelfde korf, komt terug",
    u !== "VERLOPEN" && u2 !== "VERLOPEN" && u2?.checkConfig?.betonKorf === korf, JSON.stringify(u2));
}
{
  // Een fout reist nog steeds mee (en niet als time-out).
  const a = maakActies();
  const u = await binnenGrens("staaf_selecteren", { id: 7 }, a);
  check("een onbekende staaf geeft direct de fout van de app",
    u !== "VERLOPEN" && /geen staaf met id 7/.test(u?.fout ?? ""), JSON.stringify(u));
}

// ── [2] bron ────────────────────────────────────────────────────────────────
log("\n[2] bronteksten");
const bron = readFileSync(join(HIER, "src", "bediening", "bediening.ts"), "utf8").replace(/\r\n/g, "\n");
const lichaam = /export async function voerUit\([\s\S]*?\n\}\n/.exec(bron)?.[0] ?? "";
check("voerUit is in de bron gevonden", lichaam.length > 1000, `lengte ${lichaam.length}`);
check("geen enkele actie in voerUit wacht kaal op de volgende render",
  !/await\s+wachtOpRender\s*\(/.test(lichaam));
check("verseRender forceert een commit met een eigen tik",
  /const verseRender = \(\) => \{\s*const p = wachtOpRender\(\);\s*setTik\(/.test(bron));

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
