// Kritieke lastfactor α_cr per combinatie (basisaudit nr 27). Bewaakt:
//   1. α_cr van het meetportaal (6 × 4 m, HEA160, q = 20 kN/m, γ = 1,35) komt
//      overeen met de factor waarbij de tweede-orde-berekening van dezelfde
//      motor divergeert: scharnierende voeten 5,75·G → α_cr = 5,75/1,35 = 4,26,
//      ingeklemde voeten 23,73·G → 17,58 (gemeten in de basisaudit met
//      meet-alphacr.mjs). Met twee elementen per staaf ligt de knikvorm iets
//      lager dan met één; de toleranties laten dat toe;
//   2. de Euler-kolom: pinned-pinned, P = 0,1·P_E → α_cr = 10 binnen 1 %
//      (met één element per staaf zou het 12,2 zijn — 21,6 % te hoog);
//   3. een ligger zonder druk geeft "geen_druk"; een BGT-combinatie wordt
//      overgeslagen;
//   4. de meldingen: eerste orde met α_cr < 10 is een FOUT, tweede orde
//      zonder scheefstand een waarschuwing, met scheefstand alleen info;
//   5. de toelichting noemt analysetype, α_cr en de fout als "!"-regel.
// Praat alleen met engine, combinations en alphaCr; draait ook tegen de bundel.
// Uitvoeren: npx tsx test-alpha-cr.mjs

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { bepaalAlphaCr, stabiliteitsMeldingen, analyseToelichting, alphaCrLabel } =
  await import("./src/components/fem/solver/alphaCr.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
const binnen = (a, b, pct) => Math.abs(a - b) <= Math.abs(b) * pct / 100;

const E = 210000, A = 3877, I = 1.673e7;
const uls = (id, name, factors) => ({ id, name, type: "uls", formula: "", factors: new Map(factors) });

function portaal(basis, q) {
  const h = 4000, b = 6000;
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: h }, { id: 3, x: b, z: h }, { id: 4, x: b, z: 0 }],
    beams: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 2, to: 3, E, A, I },
      { id: 3, from: 3, to: 4, E, A, I },
    ],
    supports: [{ nodeId: 1, type: basis }, { nodeId: 4, type: basis }],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 2, q: -q, caseId: 1 }],
  };
}
function reken(input, combos) {
  const { perCase } = solveAllCases(input);
  const combinationResults = new Map(combos.map((c) => [c.id, combineResults(c, perCase)]));
  return bepaalAlphaCr(input, combos, combinationResults);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Portaal 6×4 m HEA160, q = 20 kN/m, 1,35G: α_cr tegen de P-Δ-divergentie van de motor");
{
  const combos = [uls(1, "1.35G", [[1, 1.35]])];
  const p = reken(portaal("pinned", 20), combos)[0];
  check(`scharnierende voeten: bepaald, α_cr ≈ 4,26 (±3 %) — ${alphaCrLabel(p)}`, p.status === "bepaald" && binnen(p.alphaCr, 4.26, 3), `${p.alphaCr}`);
  const f = reken(portaal("fixed", 20), combos)[0];
  check(`ingeklemde voeten: bepaald, α_cr ≈ 17,58 (±3 %) — ${alphaCrLabel(f)}`, f.status === "bepaald" && binnen(f.alphaCr, 17.58, 3), `${f.alphaCr}`);
  check("de laagste ligt onder 10, de andere erboven", p.alphaCr < 10 && f.alphaCr > 10);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Euler-kolom pinned-pinned, P = 0,1·P_E → α_cr = 10 (±1 %)");
{
  const L = 3000;
  const P_E = Math.PI ** 2 * E * I / (L * L);  // N
  const input = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: L }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "xRoller" }],
    cases: [{ id: 1, name: "P" }],
    loads: [],
    pointLoads: [{ nodeId: 2, fz: -0.1 * P_E, caseId: 1 }],
  };
  const u = reken(input, [uls(1, "P", [[1, 1]])])[0];
  check(`α_cr = ${alphaCrLabel(u)} ≈ 10,0`, u.status === "bepaald" && binnen(u.alphaCr, 10, 1), `${u.alphaCr}`);
  const u2 = reken({ ...input, pointLoads: [{ nodeId: 2, fz: -0.005 * P_E, caseId: 1 }] }, [uls(1, "P", [[1, 1]])])[0];
  check("P = 0,005·P_E → boven de zoekgrens (α_cr > 100)", u2.status === "boven_grens" && u2.grens === 100, JSON.stringify(u2));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Ligger zonder druk → geen_druk; BGT-combinatie overgeslagen");
{
  const input = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    cases: [{ id: 1, name: "G" }],
    loads: [{ beamId: 1, q: -10, caseId: 1 }],
  };
  const combos = [uls(1, "UGT", [[1, 1.35]]), { id: 2, name: "BGT", type: "sls", formula: "", factors: new Map([[1, 1]]) }];
  const r = reken(input, combos);
  check("één uitkomst (alleen UGT)", r.length === 1 && r[0].combinatieId === 1);
  check("status geen_druk", r[0].status === "geen_druk");
  check("geen meldingen bij geen druk", stabiliteitsMeldingen(r, "eersteOrde", false).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Meldingen: eerste orde met α_cr < 10 is een FOUT");
{
  const combos = [uls(1, "1.35G", [[1, 1.35]])];
  const r = reken(portaal("pinned", 20), combos);
  const fout = stabiliteitsMeldingen(r, "eersteOrde", false);
  check("eerste orde: één FOUT met 5.2.1(3) en de combinatienaam", fout.length === 1 && fout[0].niveau === "fout" && /5\.2\.1\(3\)/.test(fout[0].tekst) && /1\.35G/.test(fout[0].tekst), JSON.stringify(fout));
  const w = stabiliteitsMeldingen(r, "tweedeOrdeGeometrisch", false);
  check("tweede orde zonder scheefstand: waarschuwing", w.length === 1 && w[0].niveau === "waarschuwing" && /scheefstand/.test(w[0].tekst));
  const i = stabiliteitsMeldingen(r, "tweedeOrdeGeometrisch", true);
  check("tweede orde met scheefstand: alleen info", i.length === 1 && i[0].niveau === "info");
  const ok = stabiliteitsMeldingen(reken(portaal("fixed", 20), combos), "eersteOrde", false);
  check("ingeklemd (α_cr 17,6): geen melding", ok.length === 0, JSON.stringify(ok));
  const tekst = analyseToelichting("eersteOrde", "1e orde", "Eerste orde, lineair.", r, false);
  check("toelichting: analysetype, α_cr-regel en een '!'-regel", /Analysetype: 1e orde/.test(tekst) && /α_cr = 4,\d\d/.test(tekst) && /\n! EERSTE ORDE NIET TOEGESTAAN/.test(tekst), tekst);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Model met wandschijf: niet bepaald, met reden en waarschuwing");
{
  const input = {
    ...portaal("pinned", 20),
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 200, E: 30000, nu: 0.2, rho: 2.5e-6, meshSize: 2000 }],
  };
  const r = bepaalAlphaCr(input, [uls(1, "1.35G", [[1, 1.35]])], new Map());
  check("niet_bepaald met reden 'wandschijven'", r[0].status === "niet_bepaald" && /wandschijven/.test(r[0].reden));
  check("eerste orde: waarschuwing dat de voorwaarde niet is gecontroleerd", stabiliteitsMeldingen(r, "eersteOrde", false).some((m) => m.niveau === "waarschuwing" && /niet gecontroleerd/.test(m.tekst)));
}

log(`\n${"─".repeat(50)}`);
log(`Resultaat: ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
