// Plaattoets BETON (issue #15, stap 3): van model tot benodigde wapening.
//
// WAT HIER VASTLIGT
//  [a] De bouwer stuurt de spanningen van een betonnen plaat naar de kern (via
//      de in-proces sidecar, de MCP-weg van `check_fem_model`).
//  [b] De kern via de toetsbrug: bijlage F geeft de benodigde wapening per
//      richting, de betondruk wordt getoetst, en de plaat heet niet "voldoet"
//      zolang wapening nodig is.
//
// DE HANDBEREKENING — betonnen wand, C30/37, t = 200 mm
//   B = 2000 mm, H = 3000 mm, onderrand op zRollers met het midden scharnierend
//   (vrije dwarscontractie): σ_y = p/t, σ_x = τ = 0.
//   Trekwand, p = +1000 kN/m, UGT 1,5·Q: σ_y = +7,5 N/mm² (trek).
//     Bijlage F (druk positief): σ_Edx = 0 (x), σ_Edy = −7,5 (z, trek) → F.1(4),
//     σ_Edx ≤ |τ| = 0: (F.3) f'_td,z = 0 − (−7,5) = 7,5 N/mm²
//     n_td,z = 7,5 · 200 = 1500 kN/m — precies de trekkracht 1,5·1000 kN/m die de
//     wapening moet opnemen (evenwicht). n_td,x = 0; σ_cd = 0 → UC 0.
//     Status NotApplicable (wapening nodig, aanwezige wapening niet getoetst).
//   Drukwand, p = −1000 kN/m, UGT 1,5·Q: σ_y = −7,5 N/mm².
//     σ_Edx = 7,5 (z), σ_Edy = 0 → geen trek in dwarsrichting, geen wapening:
//     6.5.2(1) (6.55) σ_Rd,max = f_cd = 1,0·30/1,5 = 20 → UC = 7,5/20 = 0,375.
//     Status Ok.
//
// Uitvoeren: npx tsx test-plaat-toets-beton.mjs   (vanuit design-mockup/)

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

const B = 2000, H = 3000, S = 500, T = 200;
function model(p) {
  const nodes = [];
  for (let i = 0; i <= 4; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });
  nodes.push({ id: 6, x: 0, z: H }, { id: 7, x: B, z: H });
  return {
    nodes,
    beams: [],
    supports: nodes.slice(0, 5).map((n) => ({ nodeId: n.id, type: n.id === 3 ? "pinned" : "zRoller" })),
    plates: [{ id: 1, nodeIds: [1, 5, 7, 6], thickness: T, meshSize: S, materiaal: "C30/37" }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "edgeLoad", caseId: 1, plateId: 1, edge: "top", q: p, qDir: "z" }],
  };
}
const COMBINATIES = [{ id: 1, name: "UGT 1,5·Q", type: "uls", formula: "1,5·Q", factors: { 1: 1.5 } }];

function invoer(p) {
  const antw = verwerkVerzoek({ v: 1, id: 1, op: "check", payload: { model: model(p), combinations: COMBINATIES } });
  checkTrue(`check slaagt (p = ${p})`, antw.ok === true, antw.error?.melding ?? "");
  return antw.result?.plate_check_inputs ?? [];
}
function kern(inputs) {
  const r = spawnSync(TOETSBRUG, [], {
    input: JSON.stringify({ opdracht: "check_plates", inputs }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    const uit = JSON.parse(r.stdout);
    return Array.isArray(uit) ? uit : [uit];
  } catch {
    return [{ fout: r.stdout || r.stderr }];
  }
}

log("\n[a] bouwer via de sidecar");
const trek = invoer(1000);
checkTrue("soort Beton, materiaal C30/37", trek[0]?.soort === "Beton" && trek[0]?.materiaal === "C30/37");
checkTrue("spanningen gaan mee", (trek[0]?.combinations?.[0]?.elements?.length ?? 0) >= 16);

log("\n[b] de kern via de toetsbrug");
if (!existsSync(TOETSBRUG)) {
  checkTrue(`toetsbrug aanwezig (${TOETSBRUG}) — bouw hem met cargo build --release -p toetsbrug`, false);
} else {
  const [u] = kern(trek);
  checkTrue("trekwand niet geweigerd", u && u.geweigerd === undefined, u?.geweigerd ?? JSON.stringify(u).slice(0, 200));
  checkRel("trekwand: n_td,z = 1,5·1000 = 1500 kN/m", u?.wapening?.max_z?.n_td_z_kn_per_m, 1500, 0.02);
  checkTrue("trekwand: n_td,x ≈ 0 (< 2 % van n_td,z)", Math.abs(u?.wapening?.max_x?.n_td_x_kn_per_m ?? NaN) < 30);
  checkTrue("trekwand: status NotApplicable", u?.status === "NotApplicable", u?.status);
  checkTrue("trekwand: aanwezige wapening als niet getoetst",
    (u?.niet_getoetst ?? []).some((n) => n.id === "wapening_aanwezig" && n.bepaalt_status));
  checkTrue("norm NEN-EN 1992-1-1", String(u?.norm).includes("1992-1-1"));

  const [d] = kern(invoer(-1000));
  checkRel("drukwand: UC = 7,5/20 (6.55)", d?.uc_max, 0.375, 0.02);
  checkTrue("drukwand: status Ok", d?.status === "Ok", d?.status);
  const calc = d?.checks?.find((c) => c.id === "F.1(3)_betondruk")?.kind?.data;
  checkTrue("drukwand: afleiding met (6.55)", String(calc?.article).includes("(6.55)"), calc?.article);
}

log(`\n${passed} geslaagd, ${failed} mislukt`);
process.exit(failed > 0 ? 1 : 0);
