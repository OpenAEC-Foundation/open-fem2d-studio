// Verouderde resultaten — na een wijziging van de rekeninstellingen, en na een
// mislukte toetsronde, mag er geen oude uitkomst blijven staan.
//
// WAT HIER MISGING (audit september 2026)
//  - Resultaten en unity checks werden alleen gewist als knopen, staven,
//    opleggingen, lasten of platen veranderden. Na een wijziging van een
//    combinatiefactor, het eigen gewicht, de scheefstand of het analysetype
//    bleven UC-badges en "Berekend om" staan. Gemeten in de app: Q-factor in
//    6.10b van 1,5 naar 3,0 — badges ongewijzigd; pas na Berekenen hout
//    0,39 → 0,56.
//  - Een mislukte toetsronde zette alleen de fout en liet de UC's van de vorige
//    ronde staan. Gemeten (IPE300, q = −18 kN/m): na "eigen gewicht aan" en een
//    mislukte ronde bleef 1,6766 staan waar 1,7074 hoorde.
//
// WAT DEZE TEST VASTLEGT
//  [1] De versie van de rekeninstellingen verandert bij ELK veld, en de lijst
//      velden in de test dekt ELK veld van `RekenInstellingen` — een nieuw veld
//      zonder testgeval laat deze test falen.
//  [2] Beide invalidatie-effecten (App.tsx en useFemStore.ts) lezen die versie.
//      Dat is een bronteksttoets: de React-hooks draaien in deze testomgeving
//      niet (geen DOM), en de afhankelijkheidslijst IS hier het gedrag.
//  [3] Een mislukte toetsronde wist dezelfde velden als `clear()` — met een
//      nagebootste onbereikbare kern, dus zonder binary.
//  [4] Hetzelfde met de echte toetsbrug: na een geslaagde ronde en een
//      mislukte ronde staat er geen UC meer. Luid overgeslagen als de binary
//      ontbreekt.
//
// Uitvoeren: npx tsx test-verouderd.mjs   (vanuit design-mockup/)

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { rekenInstellingenVersie, REKENINSTELLINGEN_VELDEN } =
  await import("./src/lib/rekenInstellingen.ts");
const { defaultCombinations, combineResults } =
  await import("./src/components/fem/solver/combinations.ts");
const { DEFAULT_LOAD_CASES } = await import("./src/hooks/useFemStore.ts");
const { useCheckStore } = await import("./src/stores/checkStore.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Elke rekeninstelling verandert de versie");
{
  const basis = () => ({
    loadCases: DEFAULT_LOAD_CASES.map((lc) => ({ ...lc })),
    combinations: defaultCombinations().map((c) => ({ ...c, factors: new Map(c.factors) })),
    selfWeightEnabled: false,
    analysetype: "eersteOrde",
    betonSegmentLengteMm: 400,
    betonKruipcoefficient: null,
    betonKruipInvoer: null,
    scheefstandEnabled: false,
    scheefstandNoemer: 200,
    scheefstandRichting: 1,
    scheefstandBron: "vast",
    scheefstandHoogteM: null,
    scheefstandAantalElementen: null,
    gevolgklasse: "CC2",
    // De nationale bijlage (normnaad): zij bepaalt de nationaal bepaalde
    // parameters van elke toetsing, dus een wijziging hoort de resultaten te
    // laten vervallen.
    nationaleBijlage: "NL",
  });
  const v0 = rekenInstellingenVersie(basis());

  check("dezelfde instellingen geven dezelfde versie", rekenInstellingenVersie(basis()) === v0);

  // De volgorde waarin factoren in een Map zijn gezet telt niet mee.
  const omgekeerd = basis();
  omgekeerd.combinations = omgekeerd.combinations.map((c) => ({
    ...c, factors: new Map([...c.factors.entries()].reverse()),
  }));
  check("volgorde van de factoren telt niet mee", rekenInstellingenVersie(omgekeerd) === v0);

  // Eén wijziging per veld. De Q-factor in de eerste UGT-combinatie ×2 is het
  // gemeten faalscenario (1,5 → 3,0).
  const wijzigingen = {
    loadCases: (m) => { m.loadCases[1] = { ...m.loadCases[1], type: "snow" }; },
    combinations: (m) => {
      const c = m.combinations.find((x) => x.type === "uls" && x.factors.has(2));
      c.factors.set(2, c.factors.get(2) * 2);
    },
    selfWeightEnabled: (m) => { m.selfWeightEnabled = true; },
    analysetype: (m) => { m.analysetype = "tweedeOrdeGeometrisch"; },
    betonSegmentLengteMm: (m) => { m.betonSegmentLengteMm = 200; },
    // φ(∞,t₀) bepaalt via (7.20) de effectieve elasticiteitsmodulus en dus
    // elke betonstijfheid: van "niet opgegeven" naar 2,0 moet een nieuwe
    // versie geven, anders blijft de zakking zonder kruip op het scherm staan.
    betonKruipcoefficient: (m) => { m.betonKruipcoefficient = 2.0; },
    // De invoer voor φ(∞,t₀) volgens bijlage B: van "uit" naar RH 50 %, t₀ 28 d,
    // cement N bepaalt de kruip van elke betonstaaf zonder opgegeven φ.
    betonKruipInvoer: (m) => { m.betonKruipInvoer = { rhProcent: 50, t0Dagen: 28, cementklasse: "N" }; },
    scheefstandEnabled: (m) => { m.scheefstandEnabled = true; },
    scheefstandNoemer: (m) => { m.scheefstandNoemer = 300; },
    scheefstandRichting: (m) => { m.scheefstandRichting = -1; },
    scheefstandBron: (m) => { m.scheefstandBron = "en1993"; },
    scheefstandHoogteM: (m) => { m.scheefstandHoogteM = 6; },
    scheefstandAantalElementen: (m) => { m.scheefstandAantalElementen = 3; },
    gevolgklasse: (m) => { m.gevolgklasse = "CC3"; },
    // Er is vandaag maar één gevulde bijlage; "naar niets" is de enige
    // wijziging die te maken is, en ook die hoort een nieuwe versie te geven.
    nationaleBijlage: (m) => { m.nationaleBijlage = null; },
  };
  for (const [veld, wijzig] of Object.entries(wijzigingen)) {
    const m = basis();
    wijzig(m);
    check(`wijziging van ${veld} geeft een nieuwe versie`, rekenInstellingenVersie(m) !== v0);
  }
  const zonderGeval = REKENINSTELLINGEN_VELDEN.filter((v) => !(v in wijzigingen));
  check(
    "elk veld van RekenInstellingen heeft hierboven een testgeval",
    zonderGeval.length === 0,
    `zonder testgeval: ${zonderGeval.join(", ")}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Beide invalidatie-effecten lezen de versie");
{
  const app = readFileSync(join(HIER, "src", "App.tsx"), "utf8");
  const store = readFileSync(join(HIER, "src", "hooks", "useFemStore.ts"), "utf8");
  const canvas = readFileSync(join(HIER, "src", "components", "fem", "FemCanvas.tsx"), "utf8");

  check(
    "App.tsx: het invalidatie-effect hangt aan fem.rekenInstellingenVersie",
    /\[fem\.nodes, fem\.beams, fem\.supports, fem\.loads, fem\.plates, fem\.rekenInstellingenVersie\]/.test(app),
  );
  check(
    "App.tsx: dat effect wist de toetsuitslagen",
    /useEffect\(\(\) => \{\s*setSolverResult\(null\);[\s\S]{0,600}?checkClear\(\);/.test(app),
  );
  check(
    "useFemStore.ts: het store-effect hangt aan rekenInstellingenVersie",
    /setCombinationResults\(null\);[\s\S]{0,900}?\}, \[nodes, beams, supports, plates, loads, rekenInstellingenVersie\]\);/.test(store),
  );
  const aanroep = /bepaalRekenInstellingenVersie\(\{([\s\S]*?)\}\)/.exec(store)?.[1] ?? "";
  const ontbreekt = REKENINSTELLINGEN_VELDEN.filter((v) => !new RegExp(`\\b${v}\\b`).test(aanroep));
  check(
    "useFemStore.ts: de versie wordt uit elk veld opgebouwd",
    aanroep !== "" && ontbreekt.length === 0,
    `ontbreekt: ${ontbreekt.join(", ")}`,
  );
  check(
    "App.tsx: de gevolgklasse uit de uitgangspunten gaat de store in",
    /gevolgklasse: projectInfo\.uitgangspunten\?\.gevolgklasse/.test(app),
  );
  check(
    "App.tsx: de nationale bijlage uit de uitgangspunten gaat de store in",
    /nationaleBijlage: projectInfo\.uitgangspunten\?\.nationaleBijlage/.test(app),
  );
  check(
    "FemCanvas.tsx: het canvasresultaat vervalt ook bij een andere scheefstand",
    /\[nodes, beams, supports, plates, loads, activeLoadCaseId, scheefstand\]/.test(canvas),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Een fetch die zich gedraagt als de dev-brug (vite.config.ts): "aan" roept de
// echte toetsbrug aan, "503" is een kern die niet gebouwd is.
let brug = "503";
globalThis.fetch = async (_url, init) => {
  const body = init.body;
  const antwoord = (status, tekst) => ({
    ok: status >= 200 && status < 300, status, text: async () => tekst,
  });
  if (brug === "503") {
    return antwoord(503, JSON.stringify({ fout: "De rekenkern is nog niet gebouwd (nagebootst)." }));
  }
  const r = spawnSync(TOETSBRUG, [], { input: body, maxBuffer: 1 << 28 });
  return antwoord(r.status === 0 ? 200 : 400, r.stdout.toString());
};

log("\n[3] Een mislukte toetsronde wist de vorige uitslag");
{
  // De toestand van een eerdere, geslaagde ronde — met de hand gezet, zodat dit
  // blok geen binary nodig heeft.
  const oud = {
    beam_id: 1, profile_name: "IPE300", steel_grade: "S235", checks: [],
    uc_max: 1.6766, status: "NotOk", governing_check_id: "6.2.5_bending_y",
  };
  useCheckStore.setState({
    results: [oud],
    skipped: [{ beamId: 9, reason: "oud" }],
    beff: [],
    lastRunAt: 123,
    lastRunData: { nodes: [], beams: [], combinations: [], combinationResults: new Map() },
    lastRunInputs: { steel: [], timber: [], clt: [], beton: [], spanning: [] },
    error: null,
  });
  brug = "503";
  await useCheckStore.getState().run({
    nodes: [], beams: [], supports: [], combinations: [], combinationResults: new Map(),
  });
  const s = useCheckStore.getState();
  check("de fout staat er", typeof s.error === "string" && s.error.includes("niet gebouwd"), String(s.error));
  check("geen oude resultaten", s.results.length === 0, JSON.stringify(s.results));
  check("geen oude overgeslagen staven", s.skipped.length === 0);
  check("geen oude run-tijd", s.lastRunAt === null);
  check("geen oude modelinvoer", s.lastRunData === null && s.lastRunInputs === null);
  check("de ronde is afgesloten", s.isRunning === false);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Met de echte rekenkern: geen oude UC na een mislukte ronde");
if (!existsSync(TOETSBRUG)) {
  failed++;
  log(`  ✗ OVERGESLAGEN: toetsbrug ontbreekt (${TOETSBRUG}). Bouw eerst: cargo build --release -p toetsbrug`);
} else {
  const model = (eigenGewicht) => ({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE300" }],
    supports: [{ id: 1, nodeId: 1, type: "pinned" }, { id: 2, nodeId: 2, type: "zRoller" }],
    plates: [],
    loadCases: [{ id: 1, name: "Permanent", type: "dead" }, { id: 2, name: "Variabel", type: "live" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 2, beamId: 1, q: -18 }],
    selfWeightEnabled: eigenGewicht, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  });
  const runData = (m) => {
    const combos = defaultCombinations();
    const { perCase } = solveAllCases(bouwMultiInput(m));
    const cr = new Map(combos.map((c) => [c.id, combineResults(c, perCase)]));
    return { nodes: m.nodes, beams: m.beams, supports: m.supports, combinations: combos, combinationResults: cr };
  };

  useCheckStore.getState().clear();
  brug = "aan";
  await useCheckStore.getState().run(runData(model(false)));
  const uc1 = useCheckStore.getState().results[0]?.uc_max;
  check("ronde 1 levert een UC", Number.isFinite(uc1) && uc1 > 0, String(uc1));

  // Eigen gewicht aan — het oude effect wiste hier niets — en de ronde faalt.
  const d2 = runData(model(true));
  brug = "503";
  await useCheckStore.getState().run(d2);
  const na = useCheckStore.getState();
  check("na de mislukte ronde staat de UC van ronde 1 er NIET meer", na.results.length === 0,
    `getoond: ${na.results.map((r) => r.uc_max).join(", ")}`);
  check("en de fout wel", na.error !== null);

  // Tegenproef: dezelfde ronde met een bereikbare kern geeft een hogere UC —
  // het eigen gewicht (IPE300, 42,2 kg/m) komt bovenop q = 18 kN/m. Precies het
  // getal dat met de oude catch door 1,6766 werd verborgen.
  brug = "aan";
  await useCheckStore.getState().run(d2);
  const uc2 = useCheckStore.getState().results[0]?.uc_max;
  check("met eigen gewicht is de UC hoger dan zonder", uc2 > uc1, `${uc1} → ${uc2}`);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
