// Plaattoets HOUT (issue #15, stap 2): van model tot unity check.
//
// WAT HIER VASTLIGT
//  [a] De bouwer geeft een houten plaat de hoofdrichting, de klimaatklasse
//      (ontbreekt = 1, met notitie) en de belastingduur PER UGT-combinatie uit
//      de belastinggevallen — dezelfde afleiding als een houten staaf.
//  [b] De sidecar (`check`) doet hetzelfde: de MCP-weg van `check_fem_model`.
//  [c] De kern via de toetsbrug: UC tegen de handberekening, k_mod per
//      combinatie, klimaatklasse 3 werkt door.
//  [d] De modelpoort weigert een klimaatklasse bij een niet-houten plaat.
//
// DE HANDBEREKENING — houten drukwand
//   B = 2000 mm, H = 3000 mm, t = 100 mm, C24, vezel VERTICAAL (90°); onderrand
//   op zRollers met het midden scharnierend. Hout rekent met ν₁₂ = 0, dus de
//   éénassige oplossing geldt: σ_y = −p/t, σ_x = τ = 0. Met de vezel verticaal
//   is σ₁ = σ_y (druk langs de vezel), σ₂ = σ_x = 0.
//   G (eigen gewicht, blijvend): p = 200 kN/m omlaag → σ = −2 N/mm²
//   Q (categorie A, middellang): p = 300 kN/m omlaag → σ = −3 N/mm²
//   Combinatie 1: 1,35·G        → σ = −2,7 N/mm²; k_mod = 0,60 (blijvend)
//     f_c,0,d = 0,60·21/1,30 = 9,692308 → UC = 2,7/9,692308 = 0,278571
//   Combinatie 2: 1,2·G + 1,5·Q → σ = −6,9 N/mm²; k_mod = 0,80 (middellang)
//     f_c,0,d = 0,80·21/1,30 = 12,923077 → UC = 6,9/12,923077 = 0,533929
//   Klimaatklasse 3, combinatie 2: k_mod = 0,65 → f_c,0,d = 10,5 → UC 0,657143
//   (6.2.2 geeft bij α = 0 dezelfde waarde als 6.1.4.)
//
// Uitvoeren: npx tsx test-plaat-toets-hout.mjs   (vanuit design-mockup/)

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
const { valideerModel } = await import("./src/mcp/valideerModel.ts");

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

const B = 2000, H = 3000, S = 500, T = 100;
function model(plaat = {}) {
  const nodes = [];
  for (let i = 0; i <= 4; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });
  nodes.push({ id: 6, x: 0, z: H }, { id: 7, x: B, z: H });
  return {
    nodes,
    beams: [],
    supports: nodes.slice(0, 5).map((n) => ({ nodeId: n.id, type: n.id === 3 ? "pinned" : "zRoller" })),
    plates: [{ id: 1, nodeIds: [1, 5, 7, 6], thickness: T, meshSize: S, materiaal: "C24", hoofdrichting: 90, ...plaat }],
    loadCases: [
      { id: 1, name: "G", type: "dead" },
      { id: 2, name: "Q", type: "live", categorie: "A" },
    ],
    loads: [
      { id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: -200, qDir: "z" },
      { id: 2, type: "edgeLoad", caseId: 2, plateId: 1, edge: "top", q: -300, qDir: "z" },
    ],
  };
}
const COMBINATIES = [
  { id: 1, name: "UGT 1,35·G", type: "uls", formula: "1,35·G", factors: { 1: 1.35 } },
  { id: 2, name: "UGT 1,2·G + 1,5·Q", type: "uls", formula: "1,2·G + 1,5·Q", factors: { 1: 1.2, 2: 1.5 } },
];

function check(m) {
  const antw = verwerkVerzoek({ v: 1, id: 1, op: "check", payload: { model: m, combinations: COMBINATIES } });
  return antw;
}
function kern(invoer) {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht: "check_plates", inputs: invoer }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  // Altijd een lijst: een foutantwoord ({ fout }) wordt zo een mislukte check
  // in plaats van een crash die de andere checks verbergt.
  try {
    const uit = JSON.parse(r.stdout);
    return Array.isArray(uit) ? uit : [uit];
  } catch {
    return [{ fout: r.stdout || r.stderr }];
  }
}

log("\n[a][b] bouwer via de sidecar");
const antw = check(model());
checkTrue("check slaagt", antw.ok === true, antw.error?.melding ?? "");
const p1 = antw.result?.plate_check_inputs?.[0];
checkTrue("soort Hout, materiaal C24", p1?.soort === "Hout" && p1?.materiaal === "C24");
checkTrue("hoofdrichting 90°", p1?.hoofdrichting_graden === 90);
checkTrue("klimaatklasse ontbreekt → Sc1", p1?.service_class === "Sc1");
checkTrue("notitie over de aangehouden klimaatklasse",
  (p1?.notities ?? []).some((n) => n.includes("klimaatklasse 1 aangehouden")));
const duur = Object.fromEntries((p1?.load_duration_per_combination ?? []).map((d) => [d.combination_id, d.load_duration]));
checkTrue("combinatie 1 blijvend, combinatie 2 middellang",
  duur[1] === "Permanent" && duur[2] === "MediumTerm", JSON.stringify(duur));
checkTrue("spanningen van beide combinaties mee", p1?.combinations?.length === 2);
checkTrue(
  "combinatie 2: σ_y = −6,9 N/mm² binnen 2 % in elk element",
  (p1?.combinations?.[1]?.elements ?? []).every((e) => Math.abs(e.sigma_y_mpa + 6.9) <= 0.02 * 6.9),
);

log("\n[c] de kern via de toetsbrug");
if (!existsSync(TOETSBRUG)) {
  checkTrue(`toetsbrug aanwezig (${TOETSBRUG}) — bouw hem met cargo build --release -p toetsbrug`, false);
} else {
  const [u] = kern([p1]);
  checkTrue("niet geweigerd", u && u.geweigerd === undefined, u?.geweigerd ?? JSON.stringify(u).slice(0, 200));
  const c1 = u?.combinaties?.find((c) => c.combination_id === 1);
  const c2 = u?.combinaties?.find((c) => c.combination_id === 2);
  checkRel("combinatie 1: UC = 2,7/9,692308 (k_mod 0,60)", c1?.uc, 0.278571, 0.02);
  checkRel("combinatie 2: UC = 6,9/12,923077 (k_mod 0,80)", c2?.uc, 0.533929, 0.02);
  checkTrue("maatgevend combinatie 2", u?.governing_combination_id === 2);
  const druk = u?.checks?.find((c) => c.id === "6.1.4_druk_evenwijdig")?.kind?.data;
  checkTrue("afleiding 6.1.4 (6.2)", druk?.article === "art. 6.1.4 (6.2)", druk?.article);
  const tr90 = (u?.niet_getoetst ?? []).find((n) => n.id === "6.1.3_trek_loodrecht");
  checkTrue("geen trek loodrecht op de vezel in een zuivere drukwand", tr90 === undefined, tr90?.reden ?? "");
  checkTrue("status Ok", u?.status === "Ok", u?.status);

  const sc3 = check(model({ klimaatklasse: 3 })).result?.plate_check_inputs?.[0];
  checkTrue("klimaatklasse 3 → Sc3", sc3?.service_class === "Sc3");
  const [u3] = kern([sc3]);
  checkRel("klimaatklasse 3, combinatie 2: UC = 6,9/10,5 (k_mod 0,65)",
    u3?.combinaties?.find((c) => c.combination_id === 2)?.uc, 0.657143, 0.02);
}

log("\n[d] modelpoort");
{
  const staal = model({ materiaal: "S235", hoofdrichting: undefined, klimaatklasse: 2 });
  const v = valideerModel(staal);
  const fouten = JSON.stringify(v);
  checkTrue("klimaatklasse bij een stalen plaat geweigerd", fouten.includes("klimaatklasse"), fouten.slice(0, 300));
  const hout = valideerModel(model({ klimaatklasse: 2 }));
  checkTrue("klimaatklasse 2 bij een houten plaat geldig", !JSON.stringify(hout).includes("klimaatklasse"));
  const onzin = valideerModel(model({ klimaatklasse: 4 }));
  checkTrue("klimaatklasse 4 geweigerd", JSON.stringify(onzin).includes("klimaatklasse"));
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed > 0 ? 1 : 0);
