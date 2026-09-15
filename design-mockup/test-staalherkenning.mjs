// Staal herkennen aan de profieldatabase, niet aan een lijst voorvoegsels.
//
// WAT HIER MISGING (audit september 2026)
// `isSteelProfile` herkende staal aan de voorvoegsels HEA, HEB, HEM, IPE, UPE,
// UNP, RHS, SHS, HFRHS, KKR en CHS. De profieldatabase kent er meer: INP (21),
// DIE (30), DIL (22), DIN (30) en L (57) — 160 profielen die de profielkiezer
// aanbood en de solver meerekende, maar die nooit getoetst werden. In de app
// met de reden "niet herkend als staal", in de MCP-weg zonder spoor.
//
// WAT DEZE TEST VASTLEGT
//  [1] ELKE sleutel van profiles.json wordt als staal herkend.
//  [2] De staalbouwer maakt voor elk van die profielen toetsinvoer en slaat er
//      geen enkele over.
//  [3] Wat geen staal is blijft geen staal; een staalsoort met een onbekende
//      profielnaam en een staaf zonder materiaal krijgen een reden.
//  [4] De rekenkern toetst INP, DIN en L werkelijk (toetsbrug; luid
//      overgeslagen als de binary ontbreekt).
//
// Er wordt hier geen unity check vastgelegd; dit is een test op herkenning.
//
// Uitvoeren: npx tsx test-staalherkenning.mjs   (vanuit design-mockup/)

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const TOETSBRUG = join(
  REPO, "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { isSteelProfile, buildSteelCheckInputs, profileLookupKey } =
  await import("./src/lib/steelCheckBuilder.ts");
const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

const profielen = JSON.parse(
  readFileSync(join(REPO, "src-tauri", "crates", "steel-profiles", "data", "profiles.json"), "utf8"),
);

// ─────────────────────────────────────────────────────────────────────────
log(`\n[1] Elk van de ${profielen.length} profielen in profiles.json is staal`);
{
  const niet = profielen.filter((p) => !isSteelProfile(p.name)).map((p) => p.name);
  check("alle profielnamen herkend", niet.length === 0, `niet herkend: ${niet.slice(0, 10).join(", ")}`);
  // De vijf reeksen die de voorvoegsellijst miste, apart geteld: 160 profielen.
  const reeks = (p) => /^[A-Z]+/.exec(p.name.toUpperCase())?.[0];
  const gemist = profielen.filter((p) => ["INP", "DIE", "DIL", "DIN", "L"].includes(reeks(p)));
  check("de 160 profielen uit INP, DIE, DIL, DIN en L zitten erbij", gemist.length === 160, String(gemist.length));
  check("en worden herkend", gemist.every((p) => isSteelProfile(p.name)));
  // Schrijfwijzen zoals ze in een model staan.
  for (const naam of ["INP 200", "DIN 20", "L 100x100x10", "hea 160", "HEA160"]) {
    check(`"${naam}" is staal`, isSteelProfile(naam));
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De staalbouwer maakt voor elk catalogusprofiel toetsinvoer");
{
  // Eén vrij opgelegde ligger van 5 m met q = 5 kN/m, eenmaal doorgerekend. Het
  // krachtsverloop wordt voor elke staaf hergebruikt: de bouwer leest per staaf
  // alleen dat verloop en de lengte, en die zijn voor alle staven gelijk.
  const knopen = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }];
  const combo = { id: 1, name: "UGT", type: "uls", formula: "1,35G", factors: new Map([[1, 1.35]]) };
  const { perCase } = solveAllCases({
    nodes: knopen,
    beams: [{ id: 1, from: 1, to: 2, E: 210000, A: 2850, I: 1.94e7 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 1, q: -5, caseId: 1 }],
  });
  const eenStaaf = combineResults(combo, perCase);
  const verloop = eenStaaf.elements.get(1);

  const beams = profielen.map((p, i) => ({ id: i + 1, from: 1, to: 2, material: "S235", profile: p.name }));
  const resultaat = { ...eenStaaf, elements: new Map(beams.map((b) => [b.id, verloop])) };
  const profileDb = new Map();
  for (const p of profielen) {
    const k = profileLookupKey(p.name);
    if (!profileDb.has(k)) profileDb.set(k, p);
  }
  const uit = buildSteelCheckInputs({
    nodes: knopen, beams, supports: [], combinations: [combo],
    combinationResults: new Map([[1, resultaat]]), profileDb,
  });
  check(`${beams.length} staven → ${beams.length} toetsinvoeren`, uit.inputs.length === beams.length,
    `${uit.inputs.length} invoeren`);
  check("geen enkele staaf overgeslagen", uit.skipped.length === 0,
    uit.skipped.slice(0, 3).map((s) => `${s.beamId}: ${s.reason}`).join(" | "));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Wat geen staal is, en staal zonder geldige gegevens");
{
  check("een houten rechthoek is geen staal", !isSteelProfile("96x450"));
  check("een onbekende profielnaam is geen catalogusprofiel", !isSteelProfile("HEA 999"));
  check("een lege naam is geen staal", !isSteelProfile("") && !isSteelProfile(undefined));

  const knopen = [{ id: 1, x: 0, z: 0 }, { id: 2, x: 5000, z: 0 }];
  // De database zoals de app hem heeft: IPE 200 staat erin, zodat staaf 2
  // alleen op zijn ontbrekende materiaal kan stranden.
  const ipe200 = profielen.find((p) => profileLookupKey(p.name) === "IPE200");
  const uit = buildSteelCheckInputs({
    nodes: knopen,
    beams: [
      { id: 1, from: 1, to: 2, material: "S235", profile: "HEA 999" },
      { id: 2, from: 1, to: 2, profile: "IPE 200" },
      { id: 3, from: 1, to: 2, material: "C24", profile: "96x450" },
    ],
    supports: [], combinations: [], combinationResults: new Map(),
    profileDb: new Map([["IPE200", ipe200]]),
  });
  const reden = (id) => uit.skipped.find((s) => s.beamId === id)?.reason ?? "";
  check("staalsoort + onbekend profiel: overgeslagen mét de reden",
    reden(1).includes("niet bekend in de EN 1993-profieldatabase"), reden(1));
  check("staalprofiel zonder materiaal: overgeslagen, geen S235 aangenomen",
    reden(2).includes("geen materiaal") && !uit.inputs.some((i) => i.beam_id === 2), reden(2));
  check("hout is niet de zaak van de staalbouwer", reden(3) === "" && !uit.inputs.some((i) => i.beam_id === 3));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] De rekenkern toetst INP, DIN en L werkelijk");
if (!existsSync(TOETSBRUG)) {
  failed++;
  log(`  ✗ OVERGESLAGEN: toetsbrug ontbreekt (${TOETSBRUG}). Bouw eerst: cargo build --release -p toetsbrug`);
} else {
  const punt = (x, my, vz) => ({
    combination_id: 1, position_mm: x,
    forces: { n_ed: 0, vy_ed: 0, vz_ed: vz, mt_ed: 0, my_ed: my, mz_ed: 0 },
  });
  const invoer = ["INP 200", "DIN 20", "L 100x100x10"].map((profiel, i) => ({
    beam_id: i + 1, profile_name: profiel, steel_grade: "S235", length_m: 5,
    forces_envelope: [punt(0, 0, 21.1), punt(2500, 26.4, 0)],
    lateral_bracing: { top_flange_positions: [], bottom_flange_positions: [] },
    buckling_length_y_m: 5, buckling_length_z_m: 5,
    deflection_limit_class: "Floor", deflection_limit_numerator: 333,
    deflection_actual_max_mm: 0, is_cantilever: false, consequence_class: "CC1",
  }));
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht: "check_steel_beams", inputs: invoer }),
    maxBuffer: 1 << 28,
  });
  let uit = null;
  try { uit = JSON.parse(r.stdout.toString()); } catch { /* hieronder gemeld */ }
  check("de toetsbrug antwoordt met drie resultaten", Array.isArray(uit) && uit.length === 3,
    r.stdout.toString().slice(0, 200) + r.stderr.toString().slice(0, 200));
  for (const res of Array.isArray(uit) ? uit : []) {
    check(`${res.profile_name}: getoetst, geen ERROR`,
      res.checks.length > 0 && !String(res.governing_check_id).startsWith("ERROR"),
      res.governing_check_id);
  }
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
