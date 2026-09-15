// Knik om de zwakke as — de hele keten van model tot toets, en de voorspelling
// in het eigenschappenpaneel tegen de werkelijke rekenkern.
//
// ── WAAROM DEZE TEST BESTAAT ───────────────────────────────────────────────
//
// De kniklengte UIT het vlak viel tot september 2026 stil terug op de
// staaflengte: de invoerbouwers vulden `lengthMm / 1000` in zodra het veld leeg
// was, en de toets kreeg een kaal getal waarvan niet te zien was of het
// opgegeven of teruggevallen was. Voor knik uit het vlak is dat de verkeerde
// plek voor een stille aanname — het vlakke raamwerkmodel ziet die richting
// nooit, ook niet in zijn tweede-orde-berekening.
//
// Nu beslist de REKENKERN (`nen_en_1993_1_1_stability::kniklengte`): een leeg
// veld gaat als 0 door, en de kern kiest opgegeven / uit de kipsteunen /
// staaflengte (terugval) en zet dat in de afleiding. Het eigenschappenpaneel
// toont dezelfde keuze al vóór de toetsing als placeholder, via
// `lib/kniklengte.ts`. Twee plaatsen met dezelfde regel lopen uit elkaar tenzij
// iets ze tegen elkaar houdt; dat doet deze test.
//
//   [1] DE BOUWERS   — een leeg veld gaat als 0 door, bij staal én hout; hout
//                      krijgt de zijdelingse steunen per rand mee.
//   [2] STAAL, KERN  — model → bouwer → toetsbrug: 6.3.1_buckling draagt per as
//                      een volledige tak, en voor vijf steunconfiguraties kiest
//                      de kern exact de L_cr,z en herkomst die de spiegel
//                      voorspelt.
//   [3] HOUT, KERN   — hetzelfde voor 6.3.2_column_stability; de drukterm van
//                      de kiptoets noemt dezelfde L_cr,z, en de kiplengte l_ef
//                      verandert NIET door de steunen.
//   [4] ZONDER VELDEN — een MCP-client die de kniklengtevelden weglaat, krijgt
//                      geen fout maar de terugval mét herkomst.
//
// [2]–[4] starten de toetsbrug als apart proces. Ontbreekt die binary, dan
// faalt deze test luid: zonder de kern is er niets tegen elkaar gehouden.
//
// Uitvoeren: npx tsx test-zwakke-as.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=zwakke-as

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { solve } = await import("./src/components/fem/solver/engine.ts");
const { defaultCombinations, combineResults } = await import(
  "./src/components/fem/solver/combinations.ts"
);
const { buildSteelCheckInputs, profileLookupKey } = await import("./src/lib/steelCheckBuilder.ts");
const { buildTimberCheckInputs } = await import("./src/lib/timberCheckBuilder.ts");
const {
  voorspelKniklengte,
  HERKOMST_OPGEGEVEN,
  HERKOMST_STAAFLENGTE,
  HERKOMST_KIPSTEUNEN,
} = await import("./src/lib/kniklengte.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}

// ─────────────────────────────────────────────────────────────────────────
// Fixture: doorgaande ligger, staalstaaf (1) en houtstaaf (2), elk 6 m —
// dezelfde opzet als test-hout-kniklengte.mjs.
// ─────────────────────────────────────────────────────────────────────────
const L = 6000;
const nodes = [
  { id: 1, x: 0, z: 0 },
  { id: 2, x: L, z: 0 },
  { id: 3, x: 2 * L, z: 0 },
];
const solverBeams = [
  { id: 1, from: 1, to: 2, E: 210000, A: 2850, I: 1.94e7 },
  { id: 2, from: 2, to: 3, E: 11000, A: 16000, I: 3.4133e7 },
];
const supports = [
  { nodeId: 1, type: "pinned" },
  { nodeId: 2, type: "zRoller" },
  { nodeId: 3, type: "zRoller" },
];
const loads = [
  { beamId: 1, q: -2 },
  { beamId: 2, q: -1 },
];
const perCase = new Map([
  [1, solve({ nodes, beams: solverBeams, supports, loads })],
  [2, solve({ nodes, beams: solverBeams, supports, loads })],
]);
const combos = defaultCombinations();
const combinationResults = new Map(combos.map((c) => [c.id, combineResults(c, perCase)]));
const profileDb = new Map([[profileLookupKey("IPE200"), { geometry: { h: 200 } }]]);

const staalStaaf = { id: 1, from: 1, to: 2, material: "S235", profile: "IPE200" };
const houtStaaf = { id: 2, from: 2, to: 3, material: "C24", profile: "100x160" };

const staal = (checkConfig) =>
  buildSteelCheckInputs({
    nodes, beams: [{ ...staalStaaf, ...(checkConfig ? { checkConfig } : {}) }],
    combinations: combos, combinationResults, profileDb,
  }).inputs[0];
const hout = (checkConfig) =>
  buildTimberCheckInputs({
    nodes, beams: [{ ...houtStaaf, ...(checkConfig ? { checkConfig } : {}) }],
    combinations: combos, combinationResults,
  }).inputs[0];

// De ligger in de fixture draagt geen normaalkracht. De knikcontrole schrijft
// haar afleiding alleen uit bij druk, dus zet de test er een op. De kniklengte
// hangt daar niet van af — zij volgt uit de config en de staaflengte.
const metDruk = (invoer, nKn) => {
  for (const p of invoer.forces_envelope) p.forces.n_ed = nKn;
  return invoer;
};

const derde = [1 / 3, 2 / 3];
const GEVALLEN = [
  ["niets ingevuld", {}, 6000, HERKOMST_STAAFLENGTE],
  ["alleen de bovenflens op ⅓ en ⅔", { lateralRestraints: derde }, 6000, HERKOMST_STAAFLENGTE],
  [
    "boven- én onderflens op ⅓ en ⅔",
    { lateralRestraints: derde, lateralRestraintsBottom: derde },
    2000, HERKOMST_KIPSTEUNEN,
  ],
  [
    "boven op ¼ ½ ¾, onder alleen op ½",
    { lateralRestraints: [0.25, 0.5, 0.75], lateralRestraintsBottom: [0.5] },
    3000, HERKOMST_KIPSTEUNEN,
  ],
  [
    "opgegeven 2,5 m gaat voor de steunen",
    { bucklingLengthZ_m: 2.5, lateralRestraints: derde, lateralRestraintsBottom: derde },
    2500, HERKOMST_OPGEGEVEN,
  ],
];

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De bouwers geven een leeg veld als 0 door — de kern kiest");
{
  const s = staal(undefined);
  const h = hout(undefined);
  ok("staal: buckling_length_y_m = 0", s.buckling_length_y_m === 0, String(s.buckling_length_y_m));
  ok("staal: buckling_length_z_m = 0", s.buckling_length_z_m === 0, String(s.buckling_length_z_m));
  ok("hout: buckling_length_y_m = 0", h.buckling_length_y_m === 0, String(h.buckling_length_y_m));
  ok("hout: buckling_length_z_m = 0", h.buckling_length_z_m === 0, String(h.buckling_length_z_m));
  ok("hout: lateral_bracing is er, leeg", Array.isArray(h.lateral_bracing?.top_flange_positions)
    && h.lateral_bracing.top_flange_positions.length === 0
    && h.lateral_bracing.bottom_flange_positions.length === 0);

  const cfg = { lateralRestraints: derde, lateralRestraintsBottom: derde, bucklingLengthY_m: 3 };
  const s2 = staal(cfg);
  const h2 = hout(cfg);
  ok("hout krijgt dezelfde steunen per rand als staal per flens",
    JSON.stringify(h2.lateral_bracing) === JSON.stringify(s2.lateral_bracing),
    JSON.stringify(h2.lateral_bracing));
  ok("een ingevulde waarde gaat 1-op-1 door", s2.buckling_length_y_m === 3 && h2.buckling_length_y_m === 3);
  // De kipsteunafstand van hout blijft los van de steunen (besluit uit test-hout-kniklengte).
  ok("hout: ltb_segment_length_m blijft 0", h2.ltb_segment_length_m === 0);

  // De voorspelling zonder kern, als rooktest van de spiegel zelf.
  const v = voorspelKniklengte(undefined, L, { boven: derde, onder: derde });
  ok("spiegel: boven+onder op ⅓ en ⅔ → 2000 mm uit de kipsteunen",
    Math.abs(v.lCrMm - 2000) < 1e-9 && v.herkomst === HERKOMST_KIPSTEUNEN, `${v.lCrMm} ${v.herkomst}`);
  const w = voorspelKniklengte(undefined, L, { boven: derde });
  ok("spiegel: alleen bovenflens → staaflengte, 2 niet meegeteld",
    w.lCrMm === L && w.herkomst === HERKOMST_STAAFLENGTE && w.alleenBoven === 2);
}

// ─────────────────────────────────────────────────────────────────────────
const KERN_AANWEZIG = existsSync(TOETSBRUG);
const kern = (opdracht, inputs) => {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht, inputs }),
    maxBuffer: 256 * 1024 * 1024,
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  const data = JSON.parse(r.stdout);
  if (data && !Array.isArray(data) && typeof data === "object" && "fout" in data) {
    throw new Error(data.fout);
  }
  return data;
};
const toets = (resultaat, id) => resultaat.checks.find((c) => c.id === id)?.kind?.data;
const stap = (toetsData, id) => toetsData?.deelstappen?.find((d) => d.id === id);

if (!KERN_AANWEZIG) {
  failed++;
  log(`\n  ✗ de rekenkern ontbreekt: ${TOETSBRUG}`);
  log("    bouw hem met  cargo build --release -p toetsbrug  vanuit src-tauri;");
  log("    zonder hem is de voorspelling niet tegen de kern gehouden.");
} else {
  // ───────────────────────────────────────────────────────────────────────
  log("\n[2] Staal: de kern kiest L_cr,z zoals de spiegel voorspelt, en toont beide takken");
  for (const [naam, cfg, verwachtMm, verwachteHerkomst] of GEVALLEN) {
    const [r] = kern("check_steel_beams", [metDruk(staal(cfg), -50)]);
    const knik = toets(r, "6.3.1_buckling");
    const lz = stap(knik, "l_cr_z");
    const v = voorspelKniklengte(cfg.bucklingLengthZ_m, L, {
      boven: cfg.lateralRestraints, onder: cfg.lateralRestraintsBottom,
    });
    ok(`${naam}: L_cr,z = ${verwachtMm} mm`, lz && Math.abs(lz.value - verwachtMm) < 1e-6, `${lz?.value}`);
    ok(`${naam}: herkomst "${verwachteHerkomst}"`, lz?.notes?.[0] === `Herkomst: ${verwachteHerkomst}.`, lz?.notes?.[0]);
    ok(`${naam}: spiegel = kern`,
      lz && Math.abs(v.lCrMm - lz.value) < 1e-6 && lz.notes[0] === `Herkomst: ${v.herkomst}.`,
      `spiegel ${v.lCrMm} (${v.herkomst})`);
    const takken = ["y", "z"].every((a) =>
      ["l_cr", "i", "lambda_bar", "kromme", "phi", "chi", "n_b_rd", "uc"].every((k) => stap(knik, `${k}_${a}`)));
    ok(`${naam}: beide takken volledig`, takken);
    ok(`${naam}: de kanttekening noemt de gebruikte L_cr,z met herkomst`,
      knik.notes.some((n) => n.includes(`L_cr,z = ${Math.round(verwachtMm)} mm (${verwachteHerkomst})`)));
  }

  // ───────────────────────────────────────────────────────────────────────
  log("\n[3] Hout: dezelfde keuze in de kolomtoets én in de drukterm van de kiptoets");
  let lefEerste = null;
  for (const [naam, cfg, verwachtMm, verwachteHerkomst] of GEVALLEN) {
    const [r] = kern("check_timber_beams", [metDruk(hout(cfg), -20)]);
    const kolom = toets(r, "6.3.2_column_stability");
    const kip = toets(r, "6.3.3_beam_stability");
    const lz = stap(kolom, "l_cr_z");
    ok(`${naam}: L_cr,z = ${verwachtMm} mm, "${verwachteHerkomst}"`,
      lz && Math.abs(lz.value - verwachtMm) < 1e-6 && lz.notes[0] === `Herkomst: ${verwachteHerkomst}.`,
      `${lz?.value} ${lz?.notes?.[0]}`);
    const takken = ["y", "z"].every((a) =>
      ["l_cr", "i", "lambda", "lambda_rel", "k", "k_c", "vergelijking"].every((k) => stap(kolom, `${k}_${a}`)));
    ok(`${naam}: k_c,y en k_c,z met hun λ_rel en (6.23)/(6.24) in de afleiding`, takken);
    ok(`${naam}: de kiptoets noemt dezelfde L_cr,z`,
      kip.notes.some((n) => n.includes(`L_cr,z = ${Math.round(verwachtMm)} mm (${verwachteHerkomst})`)),
      kip.notes.find((n) => n.includes("L_cr,z")));
    const lef = kip.variables.find((v) => v.symbol === "l_{ef}")?.value;
    if (lefEerste === null) lefEerste = lef;
    ok(`${naam}: l_ef van de kiptoets verandert niet door de steunen`, lef === lefEerste, `${lef}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  log("\n[4] Zonder kniklengtevelden: geen fout, wel de terugval met herkomst");
  {
    const s = metDruk(staal(undefined), -50);
    delete s.buckling_length_y_m;
    delete s.buckling_length_z_m;
    const [rs] = kern("check_steel_beams", [s]);
    const lz = stap(toets(rs, "6.3.1_buckling"), "l_cr_z");
    ok("staal zonder velden → staaflengte (terugval)",
      lz?.value === L && lz.notes[0] === `Herkomst: ${HERKOMST_STAAFLENGTE}.`, lz?.notes?.[0]);

    const h = metDruk(hout(undefined), -20);
    delete h.buckling_length_y_m;
    delete h.buckling_length_z_m;
    delete h.lateral_bracing;
    const [rh] = kern("check_timber_beams", [h]);
    const hz = stap(toets(rh, "6.3.2_column_stability"), "l_cr_z");
    ok("hout zonder velden en zonder steunen → staaflengte (terugval)",
      hz?.value === L && hz.notes[0] === `Herkomst: ${HERKOMST_STAAFLENGTE}.`, hz?.notes?.[0]);
  }
}

log(`\n${failed === 0 ? "ALLES GOED" : "FOUTEN"} — ${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
