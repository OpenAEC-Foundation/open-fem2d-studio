// Oude projecten en de windgenerator — tegen de hand, langs de app, de sidecar
// en de echte MCP-server.
//
// WAT HIER VASTLIGT (besluit van de gebruiker, september 2026)
// "Automatisch vervangen: bij het openen worden de oude standaardcombinaties
// vervangen door de nieuwe NB-set, met een duidelijke melding en ongedaan maken.
// Eigen, zelf toegevoegde of hernoemde combinaties blijven staan en worden
// gecontroleerd."
// Het vorige uitgangspunt — melden, niet overschrijven — liet langs steeds
// nieuwe routes stil te lage getallen door. De verificatie van golf 1 mat ze;
// ze staan in de kop van lib/combinatieBeheer.ts en bij elke controle hieronder.
//
// ELK VERWACHT GETAL IS MET DE HAND AFGELEID en staat met zijn afleiding bij de
// controle. Ligger IPE300 6 m vrij opgelegd: M = q·L²/8 = 4,5·q kNm (q in kN/m).
// Factoren: NEN-EN 1990 NB tabel NB.4 (CC2) en NB.5 (CC1, CC3), ψ uit tabel
// NB.2–A1.1 — zie components/fem/solver/normcombinaties.ts.
//
// Onderdelen:
//  [1] herkenning van een oude standaardcombinatie — en alle 67 projectbestanden
//      in de repo, zonder klasse geopend in CC1, CC2 en CC3
//  [2] B7    oud bestand, geval 3 veranderlijk: 122,850 / 85,50 kNm
//  [3] B8    oud CC3-bestand, ook na opslaan en heropenen: 95,625 kNm; N2: een
//            CC3-set zonder klasse in de projectgegevens houdt CC3 (uit het kenmerk)
//  [4] route 1: oud bestand + nieuw veranderlijk geval: 122,85 kNm
//  [5] B9b   een volledig hernoemde set, geval 3 veranderlijk: FOUT
//  [6] ongedaan maken herstelt de oude set exact, en geeft een FOUT (B8 na
//      ongedaan maken: 87,75 kNm waar 95,625 hoort — nooit stil); opnieuw vervangt weer
//  [7] windportaal: gegenereerde combinaties lopen mee; alle N–M-toestanden gedekt
//  [8] de MCP-weg: de sidecar in dit proces, en de MCP-server met project_path;
//      load_project geeft de vervangen set, en een solve daarmee rekent 95,625;
//      N8a: de oude set zelf meegestuurd geeft een FOUT
//
// Draaien met: npx tsx test-oude-projecten.mjs
//         of: node scripts/run-tests.mjs --filter=oude-projecten   (ook --bundel)
// Het slotblok start target/release/openaec-mcp-server en faalt LUID als die
// ontbreekt: bouw hem eerst (na `npm run build:sidecar`, want hij sluit de
// bundel in).

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const MCP_SERVER = join(
  REPO, "src-tauri", "target", "release",
  process.platform === "win32" ? "openaec-mcp-server.exe" : "openaec-mcp-server",
);

const B = await import("./src/lib/combinatieBeheer.ts");
const { defaultCombinations, computeEnvelope, combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { selecteerCombinaties } = await import("./src/lib/combinatieSelectie.ts");
const { deserializeProject, serializeProject, combinationsFromFile, combinationsToFile } = await import("./src/io/projectFile.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { genereerWindbelasting, STANDAARD_WIND_INSTELLINGEN } = await import("./src/lib/wind/windGenerator.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, actueel, verwacht, tolPct = 0.01) {
  const tol = Math.abs(verwacht) * tolPct / 100 + 1e-9;
  const ok = Number.isFinite(actueel) && Math.abs(actueel - verwacht) <= tol;
  if (ok) { passed++; log(`  ✓ ${naam}: ${actueel.toFixed(4)} ≈ ${verwacht.toFixed(4)}`); }
  else { failed++; log(`  ✗ ${naam}: ${actueel} vs ${verwacht}`); }
}
function checkWaar(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? " — " + extra : ""}`); }
}
const factoren = (c) => Object.fromEntries([...c.factors].sort((a, b) => a[0] - b[0]));
function checkFactoren(naam, combo, verwacht) {
  const a = JSON.stringify(combo ? factoren(combo) : null);
  const v = JSON.stringify(Object.fromEntries(Object.entries(verwacht).sort((p, q) => p[0] - q[0])));
  if (a === v) { passed++; log(`  ✓ ${naam}: ${a}`); }
  else { failed++; log(`  ✗ ${naam}: ${a} vs ${v}`); }
}

const START = [
  { id: 1, name: "Permanent (G)", type: "dead" },
  { id: 2, name: "Variabel (Q)", type: "live" },
  { id: 3, name: "Sneeuw (S)", type: "snow" },
  { id: 4, name: "Wind (W)", type: "wind" },
];

// De standaardset van versie 0.3.11 en ouder, letterlijk zoals
// `defaultCombinations()` hem op 47a4c37 maakte — als fixture voor een oud bestand.
const OUDE = [
  { id: 1, name: "ULS 6.10a", type: "uls", formula: "1.35G + 1.5·ψ₀·Q + 1.5·ψ₀·S + 1.5·ψ₀·W", factors: new Map([[1, 1.35], [2, 1.05], [3, 1.05], [4, 0.9]]) },
  { id: 2, name: "ULS 6.10b (Q leidend)", type: "uls", formula: "1.2G + 1.5Q + 1.5·ψ₀·S + 1.5·ψ₀·W", factors: new Map([[1, 1.2], [2, 1.5], [3, 1.05], [4, 0.9]]) },
  { id: 3, name: "ULS 6.10b (S leidend)", type: "uls", formula: "1.2G + 1.5S + 1.5·ψ₀·Q + 1.5·ψ₀·W", factors: new Map([[1, 1.2], [3, 1.5], [2, 1.05], [4, 0.9]]) },
  { id: 4, name: "ULS 6.10b (W leidend)", type: "uls", formula: "1.2G + 1.5W + 1.5·ψ₀·Q + 1.5·ψ₀·S", factors: new Map([[1, 1.2], [4, 1.5], [2, 1.05], [3, 1.05]]) },
  { id: 5, name: "ULS uplift", type: "uls", formula: "0.9G + 1.5W", factors: new Map([[1, 0.9], [4, 1.5]]) },
  { id: 6, name: "SLS Karakteristiek", type: "sls", formula: "G + Q + ψ₀·S + ψ₀·W", factors: new Map([[1, 1.0], [2, 1.0], [3, 0.7], [4, 0.6]]) },
  { id: 7, name: "SLS Frequent", type: "sls", formula: "G + ψ₁·Q + ψ₂·S", factors: new Map([[1, 1.0], [2, 0.5], [3, 0.2]]) },
  { id: 8, name: "SLS Quasi-permanent", type: "sls", formula: "G + ψ₂·Q", factors: new Map([[1, 1.0], [2, 0.3]]) },
];

// ── De ligger en de weg van de app ─────────────────────────────────────────
const LIGGER = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
  beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE300" }],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
};
const perCaseLigger = (lasten, gevallen) => solveAllCases({
  nodes: LIGGER.nodes,
  beams: [{ id: 1, from: 1, to: 2, E: 210000, A: 5381, I: 8.356e7 }],
  supports: LIGGER.supports,
  loads: lasten.map((l) => ({ beamId: 1, ...l })), pointLoads: [], cases: gevallen.map((c) => ({ id: c.id, name: c.name })),
}).perCase;
/** M_max (kNm) van staaf 1 over de combinaties van type `type`; NaN als er geen zijn. */
const mMax = (combos, perCase, type) => {
  const e = computeEnvelope(combos.filter((c) => c.type === type), perCase).elements.get(1);
  return e ? e.M_max / 1e6 : Number.NaN;
};
/** Zoals de store: de actieve selectie, en de meldingen met de volledige lijst en de klasse. */
function app(staat, lasten) {
  const perCase = perCaseLigger(lasten, staat.loadCases);
  const { actief } = selecteerCombinaties(staat.combinations, LIGGER.beams, [], { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse });
  return {
    ugt: mMax(actief, perCase, "uls"),
    bgt: mMax(actief, perCase, "sls"),
    meld: B.meldingenBelastinggevallen({
      loadCases: staat.loadCases, combinations: actief, alleCombinaties: staat.combinations,
      gevolgklasse: staat.gevolgklasse, loads: lasten,
    }),
  };
}
const heeftFout = (meld) => meld.some((m) => m.niveau === "fout");
/** De eis: gelijk aan de hand, of een FOUT. Een afwijkend getal zonder FOUT faalt. */
function juistOfFout(naam, gemeten, hand, fout) {
  const juist = Number.isFinite(gemeten) && Math.abs(gemeten - hand) <= Math.abs(hand) * 1e-4;
  checkWaar(`${naam}: ${gemeten.toFixed(3)} kNm, hand ${hand.toFixed(3)} — ${juist ? "juist" : fout ? "afwijkend, MET FOUT" : "STIL AFWIJKEND"}`, juist || fout);
}

/** Een projectbestand zoals een oudere versie het schreef (optioneel met tellers of klasse). */
const oudBestand = (loadCases, { combinaties = OUDE, tellers = null, klasse = null, lasten = [] } = {}) => JSON.stringify({
  format: "open-fem2d-studio-v2", version: 2, savedAt: "2026-09-01T00:00:00Z",
  ...LIGGER, plates: [],
  loads: lasten.map((l, i) => ({ id: i + 1, type: "lineLoad", beamId: 1, ...l })),
  activeLoadCaseId: 1, selfWeightEnabled: false,
  loadCases, combinations: combinationsToFile(combinaties),
  ...(tellers ? { idTellers: tellers } : {}),
  ...(klasse ? { projectInfo: { uitgangspunten: { gevolgklasse: klasse } } } : {}),
});
/**
 * Zoals App.pasProjectToe → useFemStore.loadProjectState: de klasse uit het
 * bestand, anders uit het kenmerk van de standaardcombinaties, anders de klasse
 * van het project dat open stond (`terugval`, hier standaard CC2).
 */
function openBestand(tekst, terugval = "CC2") {
  const p = deserializeProject(tekst);
  const combinations = combinationsFromFile(p.combinations);
  const { klasse, bron } = B.gevolgklasseBijOpenen({
    bestand: p.projectInfo?.uitgangspunten?.gevolgklasse, combinations, terugval,
  });
  return {
    ...B.openCombinatieStaat({ loadCases: p.loadCases, combinations, gevolgklasse: klasse, idTellers: p.idTellers }),
    klasseBron: bron,
  };
}
/** Zoals App.buildProjectSnapshot: combinaties, tellers, klasse en de melding van een vervanging. */
// `loads` hoort erbij: de opslaroute van de app schrijft alle zes de lijsten,
// en sinds `deserializeProject` een ontbrekende lijst weigert (basisaudit
// ruw 27) zou dit hulpje een bestand maken dat de app zelf nooit opslaat.
// Draagt `model` zelf lasten (de MCP-routes onderaan doen dat), dan blijven
// die staan; anders een lege lijst, want die routes leveren hun lasten in
// `app()` apart aan.
const opslaan = (staat, model, vervangingTekst) => serializeProject({
  ...model, plates: [], loads: model.loads ?? [], activeLoadCaseId: 1, selfWeightEnabled: false,
  loadCases: staat.loadCases, combinations: combinationsToFile(staat.combinations),
  idTellers: { belastinggeval: staat.volgendGevalId, combinatie: staat.volgendCombinatieId },
  projectInfo: { uitgangspunten: { gevolgklasse: staat.gevolgklasse } },
  ...(vervangingTekst ? { combinatiesVervangenBijOpenen: vervangingTekst } : {}),
});
/** Zoals de interface: addLoadCase(naam) geeft type overig, daarna updateLoadCase. */
function nieuwGeval(staat, naam, patch) {
  const t = B.voegBelastinggevalToe(staat, naam);
  return { staat: B.wijzigBelastinggeval(t.staat, t.id, patch), id: t.id };
}
const VERVANGEN = /^Bij het openen zijn 8 belastingcombinatie\(s\) van de standaardset van versie 0\.3\.11 en ouder vervangen/;

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Herkenning van een oude standaardcombinatie — op naam én factorpatroon");
{
  const ids = new Set([1, 2, 3, 4]);
  checkWaar("alle acht combinaties van 0.3.11 worden herkend", OUDE.every((c) => B.isOudeStandaardcombinatie(c, ids)));
  const [a] = OUDE;
  const variant = (patch) => ({ ...a, ...patch });
  checkWaar("hernoemd: eigen", !B.isOudeStandaardcombinatie(variant({ name: "ULS 6.10a (mijn)" }), ids));
  checkWaar("één factor anders (G 1,35 → 1,5): eigen",
    !B.isOudeStandaardcombinatie(variant({ factors: new Map([[1, 1.5], [2, 1.05], [3, 1.05], [4, 0.9]]) }), ids));
  checkWaar("een factor voor een bestaand extra geval 5: eigen",
    !B.isOudeStandaardcombinatie(variant({ factors: new Map([...a.factors, [5, 1.5]]) }), new Set([1, 2, 3, 4, 5])));
  checkWaar("de factor voor bestaand geval 4 ontbreekt: eigen",
    !B.isOudeStandaardcombinatie(variant({ factors: new Map([[1, 1.35], [2, 1.05], [3, 1.05]]) }), ids));
  checkWaar("type BGT bij deze naam: eigen", !B.isOudeStandaardcombinatie(variant({ type: "sls" }), ids));
  checkWaar("met kenmerk `standaard`: geen oude combinatie",
    !B.isOudeStandaardcombinatie(variant({ standaard: { sleutel: "6.10a", soort: "6.10a", gevolgklasse: "CC2" } }), ids));
  checkWaar("geval 4 bestaat niet en de wees-factor is al weggehaald (een opslag van de vorige versie): herkend",
    B.isOudeStandaardcombinatie(variant({ factors: new Map([[1, 1.35], [2, 1.05], [3, 1.05]]) }), new Set([1, 2, 3])));
  checkWaar("geval 4 bestaat niet en de wees-factor staat er nog (0.3.11): herkend", B.isOudeStandaardcombinatie(a, new Set([1, 2, 3])));
  const zonder = openBestand(oudBestand(START));
  const met = openBestand(oudBestand(START, { tellers: { belastinggeval: 5, combinatie: 9 } }));
  checkWaar("id-tellers in het bestand doen er niet toe: beide keren 8 vervangen",
    zonder.vervanging?.oudeStandaard.length === 8 && met.vervanging?.oudeStandaard.length === 8);

  // De referentieprojecten dragen eigen combinaties die bij een externe
  // referentie-berekening horen. Geen enkele mag worden herkend of vervangen.
  // Alle projectbestanden in de repo: referentie/ en referentie-projecten/ (elk
  // .femp en .ifcfem2d, ook in submappen), voorbeelden/ en de gouden fixture.
  // Staat de klasse niet in het bestand, dan geopend met CC1, CC2 én CC3: de
  // app neemt dan de klasse van het project dat open stond.
  const bestanden = [];
  const zoek = (map) => {
    if (!existsSync(map)) return;
    for (const f of readdirSync(map, { withFileTypes: true })) {
      const pad = join(map, f.name);
      if (f.isDirectory()) zoek(pad);
      else if (/\.(femp|ifcfem2d)$/i.test(f.name)) bestanden.push(pad);
    }
  };
  zoek(join(HIER, "referentie"));
  zoek(join(HIER, "referentie-projecten"));
  zoek(join(REPO, "voorbeelden"));
  bestanden.push(join(REPO, "src-tauri", "crates", "openaec-mcp-server", "tests", "golden", "portaal.ifcfem2d"));
  const vorm = (l) => JSON.stringify((l ?? []).map((c) => [c.id, c.name, c.type, c.formula, [...c.factors].sort((x, y) => x[0] - y[0]), c.standaard ?? null]));
  const afwijkend = [];
  let openingen = 0;
  for (const f of bestanden) {
    const tekst = readFileSync(f, "utf8");
    const p = deserializeProject(tekst);
    const combos = combinationsFromFile(p.combinations);
    const gevalIds = new Set(p.loadCases.map((c) => c.id));
    const herkend = (combos ?? []).filter((c) => B.isOudeStandaardcombinatie(c, gevalIds)).length;
    const klassen = p.projectInfo?.uitgangspunten?.gevolgklasse ? ["uit het bestand"] : ["CC1", "CC2", "CC3"];
    for (const k of klassen) {
      const o = openBestand(tekst, k === "uit het bestand" ? "CC2" : k);
      openingen++;
      const ongewijzigd = combos === undefined || vorm(o.staat.combinations) === vorm(combos);
      // Ook de controle na het openen mag de set niet voor een oude standaardset aanzien.
      const oudGemeld = B.meldingenBelastinggevallen({
        loadCases: o.staat.loadCases, combinations: o.staat.combinations, alleCombinaties: o.staat.combinations,
        gevolgklasse: o.staat.gevolgklasse, loads: p.loads,
      }).some((m) => /standaardset van versie 0\.3\.11/.test(m.tekst));
      if (herkend > 0 || o.vervanging !== null || !ongewijzigd || oudGemeld) {
        afwijkend.push(`${f} (${k}): herkend ${herkend}, vervangen ${o.vervanging !== null}, ongewijzigd ${ongewijzigd}, oude set gemeld ${oudGemeld}`);
      }
    }
  }
  checkWaar(`${bestanden.length} projectbestanden (${openingen} openingen): niets herkend, niets vervangen, lijst ongewijzigd, geen melding over een oude set`,
    bestanden.length >= 67 && afwijkend.length === 0, afwijkend.join(" | ") || String(bestanden.length));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] B7 — een oud bestand waarin geval 3 veranderlijk wordt");
// G = 4, Q = 5, geval 3 = 10 kN/m. Geval 2 en 3 zijn dan allebei veranderlijk
// cat. A, dus één belasting. Hand (NB.4, NB.2–A1.1: ψ₀ = 0,4):
//   UGT 6.10b Q leidend: 1,2·4 + 1,5·(5 + 10) = 27,3 kN/m → 27,3·4,5 = 122,850 kNm
//   UGT 6.10a:           1,35·4 + 1,5·0,4·15   = 14,4 kN/m →  64,800 kNm
//   BGT 6.14b:           4 + 5 + 10            = 19   kN/m →  85,500 kNm
// Gemeten vóór deze correctie: 112,725 / 72,00 kNm, zonder FOUT.
const lastenB7 = [{ caseId: 1, q: -4 }, { caseId: 2, q: -5 }, { caseId: 3, q: -10 }];
const gevallen3live = START.map((c) => (c.id === 3 ? { ...c, type: "live" } : c));
{
  const o = openBestand(oudBestand(START));
  checkWaar("bij het openen: de acht oude combinaties vervangen", o.vervanging?.oudeStandaard.length === 8);
  const u = app(B.wijzigBelastinggeval(o.staat, 3, { type: "live" }), lastenB7);
  check("in de app, geval 3 daarna veranderlijk: UGT 122,850 kNm", u.ugt, 122.85);
  check("…BGT 85,500 kNm", u.bgt, 85.5);
  checkWaar("…zonder FOUT", !heeftFout(u.meld), u.meld.map((m) => m.tekst).join(" | "));
  for (const [naam, tellers] of [["zonder tellers (0.3.11)", null], ["met tellers (eenmaal opgeslagen door de vorige versie)", { belastinggeval: 5, combinatie: 9 }]]) {
    const z = openBestand(oudBestand(gevallen3live, { tellers }));
    const uz = app(z.staat, lastenB7);
    check(`bestand met geval 3 al veranderlijk, ${naam}: UGT 122,850 kNm`, uz.ugt, 122.85);
    check(`…BGT 85,500 kNm`, uz.bgt, 85.5);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] B8 — een oud CC3-bestand, ook na opslaan en heropenen");
// CC3, G = 10, Q = 5. Hand (NB tabel NB.5, CC3: 6.10a 1,5·G + 1,65·ψ₀·Q;
// 6.10b 1,3·G + 1,65·Q):
//   6.10b Q leidend: 1,3·10 + 1,65·5     = 21,25 kN/m → 21,25·4,5 = 95,625 kNm
//   6.10a:           1,5·10 + 1,65·0,4·5 = 18,30 kN/m → 82,35 kNm
//   BGT 6.14b:       10 + 5              = 15    kN/m → 67,50 kNm
// Gemeten vóór deze correctie: 87,75 kNm (vaste CC2-factoren); met tellers zonder melding.
const lastenB8 = [{ caseId: 1, q: -10 }, { caseId: 2, q: -5 }];
for (const [naam, tellers] of [["zonder tellers", null], ["met tellers", { belastinggeval: 5, combinatie: 9 }]]) {
  const o = openBestand(oudBestand(START, { klasse: "CC3", tellers }));
  const u = app(o.staat, lastenB8);
  check(`${naam}: UGT 95,625 kNm`, u.ugt, 95.625);
  check(`${naam}: BGT 67,50 kNm`, u.bgt, 67.5);
  checkWaar(`${naam}: de melding noemt CC3 en NB tabel NB.5`,
    /gevolgklasse CC3/.test(o.vervanging?.samenvatting ?? "") && /NB tabel NB\.5, CC3/.test(o.vervanging?.samenvatting ?? ""),
    o.vervanging?.samenvatting);
  const tekst2 = opslaan(o.staat, LIGGER, o.vervanging?.samenvatting);
  const o2 = openBestand(tekst2);
  const u2 = app(o2.staat, lastenB8);
  check(`${naam}, opgeslagen en heropend: UGT 95,625 kNm`, u2.ugt, 95.625);
  checkWaar(`${naam}, heropend: niets meer te vervangen`, o2.vervanging === null && o2.afwijking === null);
  checkWaar(`${naam}: de melding reist mee in het bestand, voor het rapport`,
    deserializeProject(tekst2).combinatiesVervangenBijOpenen === o.vervanging?.samenvatting);
}

// ─────────────────────────────────────────────────────────────────────────
// N2 — een bestand met de CC3-standaardset (met kenmerk) maar ZONDER klasse in
// de projectgegevens, geopend terwijl het vorige project CC2 was. Zonder
// klasse uit het kenmerk werkte het openen de set bij naar CC2: 87,75 kNm waar
// de set uit het bestand zelf 95,625 gaf (hand als hierboven, NB tabel NB.5).
{
  const combosCC3 = defaultCombinations(START, "CC3");
  const tekstN2 = oudBestand(START, {
    combinaties: combosCC3, tellers: { belastinggeval: 5, combinatie: B.volgendVrijId(combosCC3, 1) }, lasten: lastenB8,
  });
  const o = openBestand(tekstN2, "CC2");
  checkWaar("N2: de klasse komt uit het kenmerk van de standaardcombinaties (CC3)",
    o.klasseBron === "kenmerk" && o.staat.gevolgklasse === "CC3", `${o.klasseBron} ${o.staat.gevolgklasse}`);
  checkWaar("N2: niets bijgewerkt of vervangen", o.vervanging === null, o.vervanging?.samenvatting);
  const u = app(o.staat, lastenB8);
  check("N2 in de app: UGT 95,625 kNm", u.ugt, 95.625);
  check("N2 in de app: BGT 67,50 kNm", u.bgt, 67.5);
  checkWaar("N2 in de app: geen FOUT", !heeftFout(u.meld), u.meld.map((m) => m.tekst.slice(0, 120)).join(" | "));
  const a = verwerkVerzoek({ v: 1, id: 31, op: "solve", payload: { project: { inhoud: tekstN2 }, detail: "stations" } });
  if (!a.ok) {
    checkWaar("N2 sidecar: solve slaagt", false, JSON.stringify(a.error));
  } else {
    const typeVan = new Map(o.staat.combinations.map((c) => [String(c.id), c.type]));
    const maxM = Math.max(...Object.entries(a.result.combinations).filter(([id]) => typeVan.get(id) === "uls")
      .map(([, x]) => Math.max(...(x.elements["1"]?.M_x ?? [Number.NEGATIVE_INFINITY]))));
    check("N2 sidecar (project.inhoud, geen klasse in bestand of verzoek): UGT 95,625 kNm", maxM, 95.625);
    checkWaar("N2 sidecar: de waarschuwing zegt dat CC3 uit het kenmerk komt",
      a.result.warnings.some((x) => /klasse CC3 komt uit het kenmerk/.test(x)) &&
        !a.result.warnings.some((x) => /opgesteld voor CC2/.test(x)),
      a.result.warnings.map((x) => x.slice(0, 120)).join(" | "));
  }
  const storeBron = readFileSync(join(HIER, "src", "hooks", "useFemStore.ts"), "utf8");
  checkWaar("useFemStore: het openen bepaalt de klasse met gevolgklasseBijOpenen",
    /gevolgklasseBijOpenen\(\{\s*bestand: p\.gevolgklasse,/.test(storeBron));
  const appBron = readFileSync(join(HIER, "src", "App.tsx"), "utf8");
  checkWaar("App: een klasse uit het kenmerk gaat ook in de projectgegevens",
    /gevolgklasseBron === "kenmerk"/.test(appBron) && /gevolgklasse: geopendeKlasse/.test(appBron));
}

log("\n[4] Route 1 — een oud bestand en een nieuw veranderlijk geval");
// "Q vloer 2" (cat. A) zoals de interface hem maakt: toevoegen, dan veranderlijk.
// G = 4, Q = 5, Q vloer 2 = 10 kN/m; hand als [2]: 122,850 / 85,50 kNm.
// Gemeten in de vorige ronden: 89,10 kNm, daarna een FOUT.
{
  const n = nieuwGeval(openBestand(oudBestand(START)).staat, "Q vloer 2", { type: "live" });
  const u = app(n.staat, [{ caseId: 1, q: -4 }, { caseId: 2, q: -5 }, { caseId: n.id, q: -10 }]);
  check("UGT 122,850 kNm", u.ugt, 122.85);
  check("BGT 85,500 kNm", u.bgt, 85.5);
  checkWaar("geen FOUT", !heeftFout(u.meld), u.meld.map((m) => m.tekst).join(" | "));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] B9b — alle standaardcombinaties hernoemd, daarna geval 3 veranderlijk");
// Een project van deze versie. Hernoemen maakt elke combinatie een eigen
// combinatie, en die volgen de gevallen niet: "UGT 6.10b — Sneeuw (S) leidend
// (eigen)" houdt 1,5 voor geval 3 en 0,6 voor geval 2:
//   (1,2·4 + 1,5·10 + 0,6·5)·4,5 = 102,60 kNm, waar 122,85 hoort (hand als [2]).
// Eis: de juiste waarde of een FOUT. Gemeten vóór deze correctie: stil 102,60.
const b9b = (() => {
  let s = { loadCases: START.map((c) => ({ ...c })), combinations: defaultCombinations(START, "CC2"), gevolgklasse: "CC2", volgendGevalId: 5, volgendCombinatieId: 25 };
  for (const c of s.combinations) s = B.wijzigCombinatie(s, c.id, { name: c.name + " (eigen)" });
  return B.wijzigBelastinggeval(s, 3, { type: "live" });
})();
{
  const u = app(b9b, lastenB7);
  check("het getal van de hernoemde set: 102,60 kNm", u.ugt, 102.6);
  juistOfFout("B9b, UGT", u.ugt, 122.85, heeftFout(u.meld));
  juistOfFout("B9b, BGT", u.bgt, 85.5, heeftFout(u.meld));
  checkWaar("FOUT: standaardcombinaties ontbreken (de hernoemde set herkend aan de formule)",
    u.meld.some((m) => m.niveau === "fout" && /standaardcombinatie\(s\) ontbreken/.test(m.tekst) && /"UGT 6\.10b — Q cat\. A leidend"/.test(m.tekst)));
  checkWaar("FOUT: geval 2 en 3 hebben in één combinatie verschillende factoren",
    u.meld.some((m) => m.niveau === "fout" && /verschillende factoren/.test(m.tekst) && /"UGT 6\.10b — Sneeuw \(S\) leidend \(eigen\)" 0,6 voor geval 2 en 1,5 voor geval 3/.test(m.tekst)));
  // Controle: zonder hernoemen volgt de set het geval, en is het getal juist.
  let s = { loadCases: START.map((c) => ({ ...c })), combinations: defaultCombinations(START, "CC2"), gevolgklasse: "CC2", volgendGevalId: 5, volgendCombinatieId: 25 };
  s = B.wijzigBelastinggeval(s, 3, { type: "live" });
  check("controle, niets hernoemd: 122,85 kNm", app(s, lastenB7).ugt, 122.85);

  // Een volledig eigen set zonder formule van de standaardset: een veranderlijke
  // belasting die nergens overheerst. G = 4, Q = 5: alleen "1,35·G + 0,6·Q".
  // Het getal (1,35·4 + 0,6·5)·4,5 = 37,80 waar (1,2·4 + 1,5·5)·4,5 = 55,35 hoort.
  const eigen = {
    loadCases: [{ id: 1, name: "G", type: "dead" }, { id: 2, name: "Q", type: "live" }], gevolgklasse: "CC2",
    combinations: [{ id: 1, name: "UGT eigen", type: "uls", formula: "1,35·G + 0,6·Q", factors: new Map([[1, 1.35], [2, 0.6]]) }],
    volgendGevalId: 3, volgendCombinatieId: 2,
  };
  const ue = app(eigen, [{ caseId: 1, q: -4 }, { caseId: 2, q: -5 }]);
  juistOfFout("volledig eigen set, Q nergens overheersend", ue.ugt, 55.35, heeftFout(ue.meld));
  checkWaar("…met een FOUT die 6.4.3.1(2) noemt",
    ue.meld.some((m) => m.niveau === "fout" && /geen enkele UGT-combinatie de overheersende/.test(m.tekst) && /6\.4\.3\.1\(2\)/.test(m.tekst)));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Ongedaan maken herstelt de oude set exact; opnieuw vervangt weer");
{
  const tekst = oudBestand(START);
  const o = openBestand(tekst);
  const uitBestand = combinationsFromFile(deserializeProject(tekst).combinations);
  const terug = B.herstelCombinaties(o.staat, o.vervanging.voor);
  const vorm = (l, metId = true) => JSON.stringify(l.map((c) => ({
    ...(metId ? { id: c.id } : {}), name: c.name, type: c.type, formula: c.formula,
    factors: [...c.factors].sort((x, y) => x[0] - y[0]), standaard: c.standaard ?? null,
  })));
  checkWaar("ongedaan maken: dezelfde combinaties als in het bestand — id, naam, type, formule, factoren, geen kenmerk",
    vorm(terug.combinations) === vorm(uitBestand));
  checkWaar("de gevallen blijven, de combinatieteller loopt niet terug",
    terug.loadCases === o.staat.loadCases && terug.volgendCombinatieId >= o.staat.volgendCombinatieId);
  // G = 4, Q = 5, S = 10 kN/m (START: geval 3 is sneeuw).
  //   oude set, "ULS 6.10b (S leidend)": 1,2·4 + 1,5·10 + 1,05·5    = 25,05 kN/m → 112,725 kNm
  //   NB-set,   "UGT 6.10b — Sneeuw (S) leidend": 1,2·4 + 1,5·10 + 0,6·5 = 22,80 kN/m → 102,600 kNm
  // (De oude set rekende Q begeleidend met de aanbevolen ψ₀ = 0,7, de NB schrijft 0,4 voor.)
  check("ongedaan: rekent weer met de oude factoren, 112,725 kNm", app(terug, lastenB7).ugt, 112.725);
  check("vervangen: de NB-set, 102,600 kNm", app(o.staat, lastenB7).ugt, 102.6);
  const opnieuw = B.vervangVerouderdeCombinaties(terug);
  checkWaar("opnieuw (Ctrl+Y): dezelfde set als bij het openen, en weer een melding",
    vorm(opnieuw.staat.combinations, false) === vorm(o.staat.combinations, false) && opnieuw.vervanging?.oudeStandaard.length === 8);
  // Na ongedaan maken is de oude set een EIGEN set, en de controles gelden: geval
  // 3 veranderlijk geeft hier de B7-waarde van vóór deze correctie — met FOUT.
  const b7 = app(B.wijzigBelastinggeval(terug, 3, { type: "live" }), lastenB7);
  check("ongedaan, daarna geval 3 veranderlijk: 112,725 kNm (de oude factoren)", b7.ugt, 112.725);
  juistOfFout("…tegen de hand", b7.ugt, 122.85, heeftFout(b7.meld));
  checkWaar("…met de FOUT dat geval 2 en 3 in één combinatie verschillende factoren hebben",
    b7.meld.some((m) => m.niveau === "fout" && /verschillende factoren/.test(m.tekst)));
  // Direct na ongedaan maken (CC2, G = 4, Q = 5, S = 10): de oude set rekent
  // "ULS 6.10b (S leidend)" met 1,05·Q (ψ₀ = 0,7) waar de NB-set 0,6·Q heeft
  // (ψ₀ = 0,4, NB.2–A1.1), en de NB-combinatie ontbreekt. Een FOUT, die de oude
  // set bij naam noemt.
  const direct = app(terug, lastenB7);
  checkWaar("ongedaan (CC2): direct een FOUT die de oude standaardset noemt en de ontbrekende combinaties",
    direct.meld.some((m) => m.niveau === "fout" && m.vervangAdvies && /standaardset van versie 0\.3\.11 en ouder/.test(m.tekst) &&
      /standaardcombinatie\(s\) ontbreken/.test(m.tekst)),
    direct.meld.map((m) => m.tekst.slice(0, 120)).join(" | "));
}

// B8 via "Ongedaan maken" (knop of Ctrl+Z op historiestap 1): de oude set
// staat terug in een CC3-project. Hand (NB tabel NB.5, CC3): 6.10b Q leidend
// (1,3·10 + 1,65·5)·4,5 = 95,625 kNm; de oude set geeft (1,2·10 + 1,5·5)·4,5 =
// 87,75 kNm. Eis: de juiste waarde of een FOUT. Gemeten door de verificatie:
// 87,75 kNm, stil.
for (const [naam, tellers] of [["zonder tellers", null], ["met tellers", { belastinggeval: 5, combinatie: 9 }]]) {
  const o = openBestand(oudBestand(START, { klasse: "CC3", tellers }));
  const terug = B.herstelCombinaties(o.staat, o.vervanging.voor);
  const u = app(terug, lastenB8);
  check(`B8 ongedaan gemaakt, ${naam}: de oude set rekent 87,75 kNm`, u.ugt, 87.75);
  juistOfFout(`B8 ongedaan gemaakt, ${naam}, UGT`, u.ugt, 95.625, heeftFout(u.meld));
  checkWaar(`B8 ongedaan gemaakt, ${naam}: de FOUT noemt de oude set, CC3 en "UGT 6.10b — Variabel (Q) leidend"`,
    u.meld.some((m) => m.niveau === "fout" && /standaardset van versie 0\.3\.11 en ouder/.test(m.tekst) &&
      /gevolgklasse CC3/.test(m.tekst) && /"UGT 6\.10b — Variabel \(Q\) leidend"/.test(m.tekst)),
    u.meld.map((m) => m.tekst.slice(0, 160)).join(" | "));
}
{
  // De store meldt het ongedaan maken, langs beide wegen.
  const storeBron = readFileSync(join(HIER, "src", "hooks", "useFemStore.ts"), "utf8");
  checkWaar("useFemStore: Ctrl+Z op de vervanging toont een melding",
    /meldVervangingOngedaan\(stap\.voor\.length/.test(storeBron));
  checkWaar("useFemStore: de knop Ongedaan maken toont een melding",
    /meldVervangingOngedaan\(\s*v\.voor\.length/.test(storeBron));

  // De store en de app gebruiken precies deze functies (brontekst, want de
  // React-store draait hier niet): het openen is een eigen historiestap,
  // Ctrl+Z herstelt, Ctrl+Y vervangt opnieuw, en de knop in de melding herstelt.
  const store = readFileSync(join(HIER, "src", "hooks", "useFemStore.ts"), "utf8");
  checkWaar("useFemStore: het openen zet de vervanging als historiestap", /combinatieStap: vervanging/.test(store));
  checkWaar("useFemStore: Ctrl+Z herstelt met herstelCombinaties", /herstelCombinaties\(combiRef\.current, stap\.voor\)/.test(store));
  checkWaar("useFemStore: Ctrl+Y vervangt opnieuw", /vervangVerouderdeCombinaties\(combiRef\.current\)/.test(store));
  checkWaar("useFemStore: de knop Ongedaan maken herstelt met herstelCombinaties", /herstelCombinaties\(combiRef\.current, v\.voor\)/.test(store));
  const appBron = readFileSync(join(HIER, "src", "App.tsx"), "utf8");
  checkWaar("App: de melding bij het openen draagt de knop Ongedaan maken",
    /label: "Ongedaan maken", onClick: fem\.maakCombinatieVervangingOngedaan/.test(appBron));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Windportaal — de gegenereerde combinaties lopen mee met gevallen en klasse");
// Portaal 12 × 6 m, voeten ingeklemd, kolommen HEA200, dakligger IPE300, S235.
// Wind van links, q_p = 1,0 kN/m², c_pi = −0,3, h.o.h. 5 m. G = 4 en Q = 3 kN/m
// op de dakligger. De windgenerator draait NIET opnieuw: na het openen van een
// project is hij nooit actief, en juist dan bleven de combinaties staan.
const PORTAAL = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 12000, z: 0 }, { id: 3, x: 0, z: 6000 }, { id: 4, x: 12000, z: 6000 }],
  beams: [
    { id: 1, from: 1, to: 3, material: "S235", profile: "HEA200" },
    { id: 2, from: 2, to: 4, material: "S235", profile: "HEA200" },
    { id: 3, from: 3, to: 4, material: "S235", profile: "IPE300" },
  ],
  supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 2, type: "fixed" }],
};
const WIND = {
  ...STANDAARD_WIND_INSTELLINGEN, stuwdrukBron: "handmatig", qpHandmatig_kNm2: 1.0,
  richtingLinks: true, richtingRechts: false, richtingHaaks: false, cpiKeuze: "min",
  hohSpant_m: 5, positieSpant: "tussenspant", belastingbreedteOverride_m: null,
  gebouwlengte_m: 30, afstandTotKopgevel_m: 15, combinatiesGenereren: true,
};
/** windStore.pasToe + useFemStore.vervangGegenereerdeBelasting, met dezelfde pure functies. */
function genereerWind(staat, loads) {
  const res = genereerWindbelasting({ nodes: PORTAAL.nodes, beams: PORTAAL.beams, loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse }, WIND);
  if (!res.ok) throw new Error("windgeneratie mislukt: " + JSON.stringify(res.meldingen));
  const bestaand = new Map(staat.loadCases.filter((c) => c.gegenereerd?.bron === "wind").map((c) => [c.gegenereerd.sleutel, c.id]));
  const bezet = new Set(staat.loadCases.map((c) => c.id));
  let volgend = Math.max(staat.loadCases.reduce((m, c) => Math.max(m, c.id), 0) + 1, staat.volgendGevalId);
  const idVan = new Map();
  for (const gv of res.gevallen) {
    const oud = bestaand.get(gv.sleutel);
    if (oud !== undefined) { idVan.set(gv.sleutel, oud); continue; }
    while (bezet.has(volgend)) volgend++;
    idVan.set(gv.sleutel, volgend); bezet.add(volgend); volgend++;
  }
  const gevallen = res.gevallen.map((gv) => ({ id: idVan.get(gv.sleutel), name: gv.naam, type: "wind", gegenereerd: { bron: "wind", sleutel: gv.sleutel } }));
  const behouden = loads.filter((l) => l.gegenereerdDoor !== "wind");
  let lid = behouden.reduce((m, l) => Math.max(m, l.id), 0) + 1;
  const nieuweLoads = [...behouden, ...res.lasten.map((l) => ({
    id: lid++, type: "lineLoad", caseId: idVan.get(l.gevalSleutel), beamId: l.beamId, q: l.q, qDir: "z", qCoord: "local",
    ...(l.startFrac !== undefined ? { startFrac: l.startFrac, endFrac: l.endFrac } : {}), gegenereerdDoor: "wind",
  }))];
  const gv2 = [...staat.loadCases.filter((c) => c.gegenereerd?.bron !== "wind"), ...gevallen];
  let volgendId = B.volgendVrijId(staat.combinations, staat.volgendCombinatieId);
  const combos = [
    ...staat.combinations.filter((c) => !B.isWindgeneratorCombinatie(c)),
    ...res.combinaties.map((c) => ({ id: volgendId++, name: c.naam, type: c.type, formula: c.formule, factors: new Map([...c.factorenPerCaseId, [idVan.get(c.windSleutel), c.windFactor]]) })),
  ];
  const nieuw = B.synchroniseerStandaard(
    { ...staat, loadCases: gv2, combinations: combos, volgendGevalId: B.volgendVrijId(gv2, staat.volgendGevalId), volgendCombinatieId: volgendId },
    { loadCases: staat.loadCases, gevolgklasse: staat.gevolgklasse },
  );
  return { staat: nieuw, loads: nieuweLoads };
}
const perCasePortaal = (staat, loads) => solveAllCases(bouwMultiInput({
  ...PORTAAL, plates: [], loadCases: staat.loadCases, loads, selfWeightEnabled: false,
  scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
})).perCase;
const voet = (c, perCase) => {
  const e = combineResults(c, perCase).elements.get(1);
  return { N: e.normalForce[0] / 1e3, M: e.bendingMoment[0] / 1e6 };
};
/** De UGT-toestanden (N, M) aan de voet van kolom 1 uit `juist` die geen combinatie uit `gebruikt` dekt. */
function nietGedekt(gebruikt, juist, perCase) {
  const g = gebruikt.filter((c) => c.type === "uls").map((c) => voet(c, perCase));
  return juist.filter((c) => c.type === "uls").filter((cj) => {
    const j = voet(cj, perCase);
    return !g.some((o) => Math.sign(o.N) === Math.sign(j.N) && Math.abs(o.N) >= Math.abs(j.N) - 1e-6 &&
      Math.sign(o.M) === Math.sign(j.M) && Math.abs(o.M) >= Math.abs(j.M) - 1e-6);
  });
}
const windSet = (lijst) => JSON.stringify(lijst.filter(B.isWindgeneratorCombinatie)
  .map((c) => `${c.type}|${c.name}|${JSON.stringify([...c.factors].sort((x, y) => x[0] - y[0]))}`).sort());
const G_DAK = { id: 1, type: "lineLoad", caseId: 1, beamId: 3, q: -4 };
const Q_DAK = { id: 2, type: "lineLoad", caseId: 2, beamId: 3, q: -3 };
const s0 = { loadCases: START.map((c) => ({ ...c })), combinations: defaultCombinations(START, "CC2"), gevolgklasse: "CC2", volgendGevalId: 5, volgendCombinatieId: 25 };
const w = genereerWind(s0, [G_DAK, Q_DAK]);
const windGeval = w.staat.loadCases.find((c) => c.gegenereerd);
const qDak2 = nieuwGeval(w.staat, "Q dak 2", { type: "live" });
const loadsA = [...w.loads, { id: 99, type: "lineLoad", caseId: qDak2.id, beamId: 3, q: -15 }];
{
  // (a) Een veranderlijk geval erbij, zonder opnieuw te genereren.
  const juist = genereerWind(qDak2.staat, loadsA);
  checkWaar("(a) 'Q dak 2' erbij: de windcombinaties zijn gelijk aan die van een nieuwe generatie",
    windSet(qDak2.staat.combinations) === windSet(juist.staat.combinations));
  // Hand (NB.4, CC2; NB.2–A1.1): γ_G = 1,2; wind overheersend γ_Q = 1,5; Q en
  // Q dak 2 zijn cat. A en samengaand 1,5·0,4 = 0,6; sneeuw samengaand ψ₀ = 0.
  checkFactoren("(a) \"UGT 6.10b — wind leidend\": 1,2·G + 0,6·Q + 0,6·Q dak 2 + 1,5·W",
    qDak2.staat.combinations.find((c) => c.name === `Wind-gen · UGT 6.10b — ${windGeval.name} leidend`),
    { 1: 1.2, 2: 0.6, [qDak2.id]: 0.6, [windGeval.id]: 1.5 });
  const pc = perCasePortaal(qDak2.staat, loadsA);
  const ng = nietGedekt(qDak2.staat.combinations, juist.staat.combinations, pc);
  checkWaar("(a) alle N–M-toestanden aan de kolomvoet gedekt (gemeten vóór deze correctie: 4 niet)", ng.length === 0,
    ng.map((c) => c.name).join(" | "));

  // (b) Een andere gevolgklasse, zonder opnieuw te genereren.
  const cc3 = B.zetGevolgklasse(w.staat, "CC3");
  const juist3 = genereerWind(cc3, w.loads);
  checkWaar("(b) CC3: de windcombinaties zijn gelijk aan die van een nieuwe generatie",
    windSet(cc3.combinations) === windSet(juist3.staat.combinations));
  // Hand (NB tabel NB.5, CC3): γ_G = 1,3 in 6.10b; γ_Q = 1,65; Q samengaand 1,65·0,4 = 0,66.
  checkFactoren("(b) \"UGT 6.10b — wind leidend\": 1,3·G + 0,66·Q + 1,65·W",
    cc3.combinations.find((c) => c.name === `Wind-gen · UGT 6.10b — ${windGeval.name} leidend`),
    { 1: 1.3, 2: 0.66, [windGeval.id]: 1.65 });
  checkWaar("(b) alle N–M-toestanden gedekt",
    nietGedekt(cc3.combinations, juist3.staat.combinations, perCasePortaal(cc3, w.loads)).length === 0);

  // (c) Een bestand dat de vorige versie zo opsloeg: 'Q dak 2' erbij, maar de
  // windcombinaties nog van vóór dat geval. Bij het openen opnieuw afgeleid.
  const verouderd = {
    ...qDak2.staat,
    combinations: [...qDak2.staat.combinations.filter((c) => !B.isWindgeneratorCombinatie(c)), ...w.staat.combinations.filter(B.isWindgeneratorCombinatie)],
  };
  const tekstC = opslaan(verouderd, { ...PORTAAL, loads: loadsA });
  const oc = openBestand(tekstC);
  checkWaar("(c) geopend: de 8 verouderde windcombinaties opnieuw afgeleid, met melding",
    oc.vervanging?.wind.length === 8 && /combinatie\(s\) van de windgenerator zijn opnieuw afgeleid/.test(oc.vervanging.samenvatting),
    oc.vervanging?.samenvatting);
  checkWaar("(c) …en gelijk aan een nieuwe generatie", windSet(oc.staat.combinations) === windSet(juist.staat.combinations));
  checkWaar("(c) …alle N–M-toestanden gedekt",
    nietGedekt(oc.staat.combinations, juist.staat.combinations, perCasePortaal(oc.staat, loadsA)).length === 0);
  // Combinaties van CC2 (kenmerk en formule), projectgegevens CC3.
  const oc3 = openBestand(opslaan({ ...w.staat, gevolgklasse: "CC3" }, { ...PORTAAL, loads: w.loads }));
  checkWaar("(c) een CC2-bestand geopend in CC3: standaard- en windcombinaties bijgewerkt, met melding",
    oc3.vervanging?.bijgewerkt.length === 12 && oc3.vervanging.wind.length === 8, oc3.vervanging?.samenvatting);
  checkFactoren("(c) een CC2-bestand geopend in CC3: de windcombinatie krijgt 1,3 / 0,66 / 1,65",
    oc3.staat.combinations.find((c) => c.name === `Wind-gen · UGT 6.10b — ${windGeval.name} leidend`),
    { 1: 1.3, 2: 0.66, [windGeval.id]: 1.65 });

  // (d) Gegenereerde combinaties zonder gegenereerd windgeval om ze uit af te
  // leiden (het kenmerk is weg): niet bij te werken, dus een FOUT met de actie.
  const zonderKenmerk = {
    ...qDak2.staat,
    loadCases: qDak2.staat.loadCases.map((c) => (c.gegenereerd ? { id: c.id, name: c.name, type: c.type } : c)),
  };
  checkWaar("(d) niet af te leiden: de combinaties blijven staan", B.synchroniseerWindCombinaties(zonderKenmerk) === zonderKenmerk);
  const fout = B.meldingenBelastinggevallen({
    loadCases: zonderKenmerk.loadCases, combinations: zonderKenmerk.combinations, alleCombinaties: zonderKenmerk.combinations,
    gevolgklasse: "CC2", loads: loadsA,
  }).find((m) => m.windOpnieuwAdvies);
  checkWaar("(d) …en een FOUT die zegt dat de gegenereerde set verouderd is, met de actie om opnieuw te genereren",
    fout?.niveau === "fout" && /verouderd/.test(fout.tekst) && /genereer de windbelasting opnieuw/.test(fout.tekst), fout?.tekst);

  // (e) De MCP-weg met zelf meegestuurde combinaties: de CC2-windcombinaties bij
  // een verzoek in CC3 worden niet stil gebruikt.
  const r = verwerkVerzoek({ v: 1, id: 71, op: "solve", payload: {
    model: { ...PORTAAL, plates: [], loadCases: w.staat.loadCases, loads: w.loads, selfWeightEnabled: false },
    combinations: combinationsToFile(w.staat.combinations), gevolgklasse: "CC3",
  } });
  checkWaar("(e) MCP, eigen CC2-windcombinaties in een CC3-verzoek: FOUT in warnings",
    r.ok === true && r.result.warnings.some((x) => /^FOUT: \d+ combinatie\(s\) van de windgenerator passen niet/.test(x)),
    JSON.stringify(r.error ?? r.result?.warnings?.filter((x) => x.startsWith("FOUT"))));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] De MCP-weg — de sidecar in dit proces, en de MCP-server met project_path");
const tellersOud = { belastinggeval: 5, combinatie: 9 };
const lasten1 = [{ caseId: 1, q: -4 }, { caseId: 2, q: -5 }, { caseId: 5, q: -10 }];
const verouderdWind = {
  ...qDak2.staat,
  combinations: [...qDak2.staat.combinations.filter((c) => !B.isWindgeneratorCombinatie(c)), ...w.staat.combinations.filter(B.isWindgeneratorCombinatie)],
};
const routes = [
  { naam: "B7 (0.3.11, geval 3 veranderlijk, geen tellers)", tekst: oudBestand(gevallen3live, { lasten: lastenB7 }), ugt: 122.85, bgt: 85.5, melding: VERVANGEN },
  { naam: "B8 (oud CC3-bestand met tellers)", tekst: oudBestand(START, { klasse: "CC3", tellers: tellersOud, lasten: lastenB8 }), ugt: 95.625, bgt: 67.5, melding: VERVANGEN },
  { naam: "route 1 (oud bestand met tellers, Q vloer 2 erbij)", tekst: oudBestand([...START, { id: 5, name: "Q vloer 2", type: "live" }], { tellers: { belastinggeval: 6, combinatie: 9 }, lasten: lasten1 }), ugt: 122.85, bgt: 85.5, melding: VERVANGEN },
  { naam: "B9b (hernoemde set, geval 3 veranderlijk)", tekst: opslaan(b9b, { ...LIGGER, loads: lastenB7.map((l, i) => ({ id: i + 1, type: "lineLoad", beamId: 1, ...l })) }), ugt: 122.85, bgt: 85.5, melding: /^FOUT: .*verschillende factoren/, foutVerwacht: true },
  { naam: "windportaal (verouderde windcombinaties in het bestand)", tekst: opslaan(verouderdWind, { ...PORTAAL, loads: loadsA }), portaal: true, melding: /combinatie\(s\) van de windgenerator zijn opnieuw afgeleid/ },
];
/** Wat de sidecar voor dit bestand zou moeten opleveren: dezelfde functie, dus dezelfde id's. */
function verwacht(route) {
  const o = openBestand(route.tekst);
  if (!route.portaal) return { combos: o.staat.combinations };
  const juist = genereerWind(qDak2.staat, loadsA);
  const pc = perCasePortaal(o.staat, loadsA);
  const maxAbs = (lijst) => Math.max(...lijst.filter((c) => c.type === "uls")
    .map((c) => Math.max(...combineResults(c, pc).elements.get(1).bendingMoment.map((x) => Math.abs(x) / 1e6))));
  return { combos: o.staat.combinations, kolomMaxJuist: maxAbs(juist.staat.combinations) };
}
function beoordeel(bron, route, antwoord) {
  const { combos, kolomMaxJuist } = verwacht(route);
  const typeVan = new Map(combos.map((c) => [String(c.id), c.type]));
  const staaf = route.portaal ? "1" : "1";
  const maxM = (t, abs) => Math.max(...Object.entries(antwoord.combinations)
    .filter(([id]) => typeVan.get(id) === t)
    // Een combinatie met alleen lege gevallen heeft geen resultaat voor de staaf.
    .map(([, x]) => Math.max(...(x.elements[staaf]?.M_x ?? [Number.NEGATIVE_INFINITY]).map((m) => (abs ? Math.abs(m) : m)))));
  const fouten = (antwoord.warnings ?? []).filter((x) => x.startsWith("FOUT:"));
  checkWaar(`${bron} ${route.naam}: rekent met dezelfde combinaties als de app na het openen`,
    Object.keys(antwoord.combinations).length + (antwoord.combinations_skipped ?? []).length === combos.length,
    `${Object.keys(antwoord.combinations).length} + ${(antwoord.combinations_skipped ?? []).length} tegen ${combos.length}`);
  if (route.portaal) {
    check(`${bron} ${route.naam}: max |M| kolom 1 over de UGT = die van een nieuwe generatie`, maxM("uls", true), kolomMaxJuist, 1e-4);
    checkWaar(`${bron} ${route.naam}: geen FOUT over de windcombinaties`, !fouten.some((x) => /windgenerator/.test(x)), fouten.join(" | "));
  } else if (route.foutVerwacht) {
    juistOfFout(`${bron} ${route.naam}, UGT`, maxM("uls"), route.ugt, fouten.length > 0);
  } else {
    check(`${bron} ${route.naam}: UGT`, maxM("uls"), route.ugt);
    check(`${bron} ${route.naam}: BGT`, maxM("sls"), route.bgt);
    checkWaar(`${bron} ${route.naam}: geen FOUT`, fouten.length === 0, fouten.join(" | "));
  }
  checkWaar(`${bron} ${route.naam}: de verwachte melding staat in warnings`, (antwoord.warnings ?? []).some((x) => route.melding.test(x)),
    (antwoord.warnings ?? []).map((x) => x.slice(0, 140)).join(" | "));
}

/** Max M (kNm) van staaf 1 in een solve-antwoord, over de combinaties van `type` volgens `lijst`. */
function maxUit(antwoord, lijst, type) {
  const typeVan = new Map(lijst.map((c) => [String(c.id), c.type]));
  return Math.max(...Object.entries(antwoord.combinations).filter(([id]) => typeVan.get(id) === type)
    .map(([, x]) => Math.max(...(x.elements["1"]?.M_x ?? [Number.NEGATIVE_INFINITY]))));
}
// load_project op het oude CC3-bestand met tellers (route B8), en daarna een
// solve met precies wat load_project teruggaf. Gemeten door de verificatie met
// de echte server: load gaf de acht oude combinaties rauw terug, en de solve
// daarmee in CC3 gaf 87,75 kNm waar (1,3·10 + 1,65·5)·4,5 = 95,625 hoort, stil.
const B8_TEKST = routes[1].tekst;
function beoordeelLoad(bron, L) {
  const o = openBestand(B8_TEKST);
  checkWaar(`${bron} load_project (B8): dezelfde combinaties als de app na het openen`,
    L.counts?.combinations === o.staat.combinations.length &&
      JSON.stringify(L.combinations.map((c) => [c.id, c.name])) === JSON.stringify(o.staat.combinations.map((c) => [c.id, c.name])),
    `${L.counts?.combinations} tegen ${o.staat.combinations.length}`);
  checkWaar(`${bron} load_project (B8): geen enkele combinatie van de oude set`,
    !L.combinations.some((c) => B.OUDE_STANDAARDSET.some((x) => x.naam === c.name)));
  checkWaar(`${bron} load_project (B8): gevolgklasse CC3 uit het bestand, combinaties uit het bestand`,
    L.gevolgklasse === "CC3" && L.combinations_source === "bestand", `${L.gevolgklasse} ${L.combinations_source}`);
  checkWaar(`${bron} load_project (B8): de vervanging staat in warnings`,
    (L.warnings ?? []).some((x) => VERVANGEN.test(x)), JSON.stringify(L.warnings ?? null).slice(0, 300));
}
function beoordeelSolveNaLoad(bron, antwoord, L) {
  check(`${bron} solve met model, combinaties en klasse uit load_project: UGT 95,625 kNm`, maxUit(antwoord, L.combinations, "uls"), 95.625);
  check(`${bron} …BGT 67,50 kNm`, maxUit(antwoord, L.combinations, "sls"), 67.5);
  const fouten = (antwoord.warnings ?? []).filter((x) => x.startsWith("FOUT:"));
  checkWaar(`${bron} …geen FOUT`, fouten.length === 0, fouten.join(" | "));
}
{
  const l = verwerkVerzoek({ v: 1, id: 83, op: "load_project", payload: { inhoud: B8_TEKST } });
  if (!l.ok) {
    checkWaar("sidecar load_project (B8) slaagt", false, JSON.stringify(l.error));
  } else {
    beoordeelLoad("sidecar", l.result);
    const s = verwerkVerzoek({ v: 1, id: 84, op: "solve", payload: {
      model: l.result.model, combinations: l.result.combinations, gevolgklasse: l.result.gevolgklasse, detail: "stations",
    } });
    if (!s.ok) checkWaar("sidecar solve na load_project slaagt", false, JSON.stringify(s.error));
    else beoordeelSolveNaLoad("sidecar", s.result, l.result);
  }
  // N8a — de acht oude combinaties zelf meegestuurd, gevolgklasse CC3. Ze
  // blijven staan (een uitdrukkelijke keuze van de aanvrager), maar niet stil:
  // (1,2·10 + 1,5·5)·4,5 = 87,75 kNm waar 95,625 hoort.
  const model = { ...LIGGER, plates: [], loadCases: START, selfWeightEnabled: false,
    loads: lastenB8.map((x, i) => ({ id: i + 1, type: "lineLoad", beamId: 1, ...x })) };
  const n8 = verwerkVerzoek({ v: 1, id: 85, op: "solve", payload: {
    model, combinations: combinationsToFile(OUDE), gevolgklasse: "CC3", detail: "stations",
  } });
  if (!n8.ok) {
    checkWaar("sidecar N8a solve slaagt", false, JSON.stringify(n8.error));
  } else {
    const u = maxUit(n8.result, OUDE, "uls");
    const fouten = n8.result.warnings.filter((x) => x.startsWith("FOUT:"));
    check("sidecar N8a (de acht oude combinaties meegestuurd, CC3): 87,75 kNm", u, 87.75);
    juistOfFout("sidecar N8a, UGT", u, 95.625, fouten.length > 0);
    checkWaar("sidecar N8a: de FOUT noemt de oude standaardset",
      fouten.some((x) => /standaardset van versie 0\.3\.11 en ouder/.test(x) && /standaardcombinatie\(s\) ontbreken/.test(x)),
      fouten.map((x) => x.slice(0, 140)).join(" | "));
  }
}

// De sidecar in dit proces (bron of bundel, afhankelijk van de stand van de runner).
for (const route of routes) {
  const a = verwerkVerzoek({ v: 1, id: 81, op: "solve", payload: { project: { inhoud: route.tekst }, detail: "stations" } });
  if (!a.ok) { checkWaar(`sidecar ${route.naam}: solve slaagt`, false, JSON.stringify(a.error)); continue; }
  beoordeel("sidecar", route, a.result);
}

// De echte MCP-server, met project_path: Rust leest het bestand en geeft de
// inhoud aan de ingebakken bundel.
async function mcpServer(aanroepen) {
  return new Promise((ok, mis) => {
    const k = spawn(MCP_SERVER, [], { stdio: ["pipe", "pipe", "pipe"] });
    const klok = setTimeout(() => { k.kill(); mis(new Error("MCP-server reageerde niet binnen 120 s")); }, 120_000);
    let buf = "";
    const antwoorden = new Map();
    k.on("error", (e) => { clearTimeout(klok); mis(e); });
    k.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const regel = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!regel) continue;
        const j = JSON.parse(regel);
        antwoorden.set(j.id, j);
        if (antwoorden.size === aanroepen.length + 1) {
          clearTimeout(klok);
          k.stdin.end();
          ok(aanroepen.map((_, n) => antwoorden.get(n + 2)));
        }
      }
    });
    const schrijf = (o) => k.stdin.write(JSON.stringify(o) + "\n");
    schrijf({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test-oude-projecten", version: "1" } } });
    aanroepen.forEach((a, n) => schrijf({ jsonrpc: "2.0", id: n + 2, method: "tools/call", params: { name: a.name, arguments: a.arguments } }));
  });
}
if (!existsSync(MCP_SERVER)) {
  checkWaar("MCP-server gevonden — bouw hem met `cargo build --release -p openaec-mcp-server` (na `npm run build:sidecar`)", false, MCP_SERVER);
} else {
  const map = mkdtempSync(join(tmpdir(), "fem2d-oude-projecten-"));
  try {
    const paden = routes.map((r, i) => {
      const pad = join(map, `route-${i + 1}.ifcfem2d`);
      writeFileSync(pad, r.tekst);
      return pad;
    });
    const antwoorden = await mcpServer(paden.map((p) => ({ name: "solve_fem_model", arguments: { project_path: p, detail: "stations" } })));
    routes.forEach((route, i) => {
      const a = antwoorden[i];
      if (!a || a.error || a.result?.isError) {
        checkWaar(`MCP-server ${route.naam}: solve_fem_model slaagt`, false, JSON.stringify(a?.error ?? a?.result?.content).slice(0, 400));
        return;
      }
      beoordeel("MCP-server", route, a.result.structuredContent);
    });
    // load_fem_project → solve_fem_model met wat load teruggaf (B8, route 2).
    const [load] = await mcpServer([{ name: "load_fem_project", arguments: { path: paden[1] } }]);
    const L = load?.result?.structuredContent;
    if (!L || load.error || load.result?.isError) {
      checkWaar("MCP-server load_fem_project (B8) slaagt", false, JSON.stringify(load?.error ?? load?.result?.content).slice(0, 400));
    } else {
      beoordeelLoad("MCP-server", L);
      const [solve] = await mcpServer([{ name: "solve_fem_model", arguments: {
        model: L.model, combinations: L.combinations, gevolgklasse: L.gevolgklasse, detail: "stations",
      } }]);
      if (!solve || solve.error || solve.result?.isError) {
        checkWaar("MCP-server solve_fem_model na load_fem_project slaagt", false, JSON.stringify(solve?.error ?? solve?.result?.content).slice(0, 400));
      } else {
        beoordeelSolveNaLoad("MCP-server", solve.result.structuredContent, L);
      }
    }
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
