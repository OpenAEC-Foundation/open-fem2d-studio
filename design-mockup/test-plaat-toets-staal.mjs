// Plaattoets STAAL (issue #15, stap 1): van model tot unity check.
//
// WAT HIER VASTLIGT
//  [a] De bouwer (`lib/plaatCheckBuilder`) zet de elementspanningen van elke
//      doorgerekende UGT-combinatie ONGEWIJZIGD in de kerninvoer, met het
//      materiaal zoals de stijfheid het herkende en de dikte waarmee gerekend
//      is. BGT-combinaties gaan niet mee.
//  [b] Een plaat zonder materiaal, of met een onbruikbaar materiaal, gaat niet
//      naar de kern maar staat met reden in `skipped`. Een herkend materiaal
//      dat de kern niet toetst (kruislaaghout) gaat wél, zonder spanningen.
//  [c] De sidecar (`check`) levert `plate_check_inputs` en `skipped_plates`
//      met dezelfde bouwer — de MCP-weg van `check_fem_model`.
//  [d] De echte kern via de toetsbrug: UC tegen de handberekening.
//
// DE HANDBEREKENING — trekwand, dezelfde als test-plaat-randlast.mjs
//   B = 2000 mm, H = 3000 mm, t = 20 mm, meshSize 500; onderrand op zRollers
//   met het midden scharnierend, zodat de dwarscontractie vrij is en de
//   éénassige oplossing geldt: σ_y = p/t, σ_x = τ = 0.
//   p = 1000 kN/m omhoog op de bovenrand (geval 1) → p/t = 1000/20 = 50 N/mm².
//   Combinatie 1 (UGT, 1,5·Q): σ_y = 75 N/mm²  → UC = 75/235  = 0,319149
//   Combinatie 2 (UGT, 3,0·Q): σ_y = 150 N/mm² → UC = 150/235 = 0,638298
//   Combinatie 3 (BGT, 1,0·Q): niet in de toetsinvoer.
//   S235, t = 20 mm ≤ 40 mm → f_y = 235 N/mm² (tabel 3.1), γ_M0 = 1,00.
//   Elementgemiddelde spanning: binnen 2 % van de analytische waarde, zoals
//   test-plaat-randlast dat voor σ_y al vastlegt.
//
// Uitvoeren: npx tsx test-plaat-toets-staal.mjs   (vanuit design-mockup/)

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const TOETSBRUG = join(
  resolve(HIER, ".."), "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");
const { buildPlaatCheckInputs } = await import("./src/lib/plaatCheckBuilder.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkRel(name, actual, expected, tolRel) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolRel * Math.abs(expected);
  checkTrue(name, ok, `${Number(actual).toPrecision(7)} ≈ ${Number(expected).toPrecision(7)}`);
}

const B = 2000, H = 3000, S = 500, T = 20, P = 1000;
const SIGMA = P / T; // N/mm² (kN/m = N/mm)
const F_Y = 235;

function model(plaat = {}) {
  const nodes = [];
  for (let i = 0; i <= 4; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });
  nodes.push({ id: 6, x: 0, z: H }, { id: 7, x: B, z: H });
  return {
    nodes,
    beams: [],
    supports: nodes.slice(0, 5).map((n) => ({ nodeId: n.id, type: n.id === 3 ? "pinned" : "zRoller" })),
    plates: [{ id: 1, nodeIds: [1, 5, 7, 6], thickness: T, meshSize: S, materiaal: "S235", ...plaat }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: P, qDir: "z" }],
  };
}
const COMBINATIES = [
  { id: 1, name: "UGT 1,5·Q", type: "uls", formula: "1,5·Q", factors: { 1: 1.5 } },
  { id: 2, name: "UGT 3,0·Q", type: "uls", formula: "3,0·Q", factors: { 1: 3.0 } },
  { id: 3, name: "BGT Q", type: "sls", formula: "Q", factors: { 1: 1.0 } },
];

// ─────────────────────────────────────────────────────────────────────────
log("\n[c] sidecar `check`: plate_check_inputs uit dezelfde bouwer");
const antw = verwerkVerzoek({ v: 1, id: 1, op: "check", payload: { model: model(), combinations: COMBINATIES } });
checkTrue("check slaagt", antw.ok === true, antw.error?.melding ?? "");
const invoer = antw.result?.plate_check_inputs ?? [];
checkTrue("één plaat in de toetsinvoer", invoer.length === 1, String(invoer.length));
checkTrue("skipped_plates leeg", Array.isArray(antw.result?.skipped_plates) && antw.result.skipped_plates.length === 0);
const p1 = invoer[0];

log("\n[a] de invoer: materiaal, dikte, alleen UGT, spanningen ongewijzigd");
checkTrue("soort Staal, materiaal S235", p1?.soort === "Staal" && p1?.materiaal === "S235", `${p1?.soort} ${p1?.materiaal}`);
checkTrue("dikte 20 mm", p1?.thickness_mm === T);
checkTrue("bijlage NL", p1?.bijlage === "NL");
checkTrue(
  "alleen de UGT-combinaties 1 en 2",
  JSON.stringify(p1?.combinations.map((c) => c.combination_id)) === "[1,2]",
  JSON.stringify(p1?.combinations.map((c) => c.combination_id)),
);
for (const [i, factor] of [[0, 1.5], [1, 3.0]]) {
  const els = p1?.combinations[i]?.elements ?? [];
  checkTrue(`combinatie ${i + 1}: 16 of meer elementen`, els.length >= 16, String(els.length));
  checkTrue(
    `combinatie ${i + 1}: σ_y = ${factor}·p/t binnen 2 % in elk element`,
    els.every((e) => Math.abs(e.sigma_y_mpa - factor * SIGMA) <= 0.02 * factor * SIGMA),
  );
  checkTrue(
    `combinatie ${i + 1}: σ_x en τ klein (< 2 % van σ_y)`,
    els.every((e) => Math.abs(e.sigma_x_mpa) < 0.02 * factor * SIGMA && Math.abs(e.tau_xy_mpa) < 0.02 * factor * SIGMA),
  );
}

log("\n[b] bouwer: zonder materiaal, onbruikbaar materiaal, kruislaaghout");
{
  const plaat = model().plates[0];
  const uit = buildPlaatCheckInputs({
    plates: [
      { ...plaat, id: 11, materiaal: undefined },
      { ...plaat, id: 12, materiaal: "S999" },
      { ...plaat, id: 13, materiaal: "CLT C24 40/20/40", cltG12Bovengrens: true },
    ],
    combinations: [],
    combinationResults: new Map(),
  });
  checkTrue("plaat zonder materiaal overgeslagen met reden",
    uit.skipped.some((s) => s.plateId === 11 && s.reason.includes("geen materiaal")));
  checkTrue("onbruikbaar materiaal overgeslagen met reden",
    uit.skipped.some((s) => s.plateId === 12 && s.reason.includes("S999")));
  const clt = uit.inputs.find((i) => i.plate_id === 13);
  checkTrue("kruislaaghout gaat naar de kern, zonder spanningen",
    clt?.soort === "Kruislaaghout" && clt.combinations.length === 0);
  checkTrue("niets dubbel of kwijt", uit.inputs.length + uit.skipped.length === 3);
}

log("\n[d] de kern via de toetsbrug");
if (!existsSync(TOETSBRUG)) {
  checkTrue(`toetsbrug aanwezig (${TOETSBRUG}) — bouw hem met cargo build --release -p toetsbrug`, false);
} else {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht: "check_plates", inputs: invoer }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let res = null;
  try { res = JSON.parse(r.stdout); } catch { /* hieronder gemeld */ }
  checkTrue("toetsbrug antwoordt met een lijst", Array.isArray(res), r.stderr || r.stdout.slice(0, 200));
  const u = Array.isArray(res) ? res[0] : null;
  checkTrue("niet geweigerd", u && u.geweigerd === undefined, u?.geweigerd ?? "");
  checkRel("UC_max = 150/235 (combinatie 2)", u?.uc_max, (3.0 * SIGMA) / F_Y, 0.02);
  checkTrue("maatgevende combinatie 2", u?.governing_combination_id === 2, String(u?.governing_combination_id));
  const c1 = u?.combinaties?.find((c) => c.combination_id === 1);
  checkRel("combinatie 1: UC = 75/235", c1?.uc, (1.5 * SIGMA) / F_Y, 0.02);
  checkTrue("omhullende per element aanwezig", (u?.elementen?.length ?? 0) === p1.combinations[0].elements.length);
  checkTrue("status Ok", u?.status === "Ok");
  checkTrue("plooi staat als niet getoetst", (u?.niet_getoetst ?? []).some((n) => n.id === "en1993_1_5_plooi"));
  const calc = u?.checks?.[0]?.kind?.data;
  checkTrue("afleiding: artikel 6.2.1(5) (6.1)", calc?.article === "art. 6.2.1(5) (6.1)", calc?.article);
  checkRel("afleiding: f_y = 235", calc?.deelstappen?.find((d) => d.id === "f_y")?.value, F_Y, 1e-12);
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed > 0 ? 1 : 0);
