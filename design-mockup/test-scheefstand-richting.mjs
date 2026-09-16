// Scheefstand in BEIDE richtingen (basisaudit nr 28). Tot september 2026
// rekende de motor één vaste richting voor alle combinaties; EN 1993-1-1
// 5.3.2(2) eist de imperfectie in de meest ongunstige richting. Bewaakt:
//   1. solveAllCases levert bij een scheefstand elk geval tweemaal: onder het
//      eigen id (primaire richting) en onder id + offset (tegengesteld);
//   2. metScheefstandRichtingen ontvouwt elke combinatie in twee varianten,
//      met de richting in de naam en het oorspronkelijke id op de primaire;
//   3. combineResults leest per variant de juiste set gevallen;
//   4. de omhullende bevat de ongunstigste richting, ongeacht de instelling
//      — het meetgeval: ingeklemde kolom 6 m met een console van 100 mm en
//      P = 400 kN geeft 70,20 kNm (+x) tegen 54,00 kNm (−x); de omhullende
//      hoort 70,20 te geven, ook als de instelling −x is;
//   5. het tweede-orde-pad kiest per variant dezelfde richting (86,52 kNm);
//   6. zonder scheefstand verandert er niets.
// Praat alleen met engine en combinations, dus draait ook tegen de bundel.
// Uitvoeren: npx tsx test-scheefstand-richting.mjs

const {
  solveAllCases, solveAllCasesNonlinear, getScheefstandRichtingen, gevalResultaten,
  SCHEEFSTAND_ID_OFFSET,
} = await import("./src/components/fem/solver/engine.ts");
const {
  combineResults, computeEnvelope, metScheefstandRichtingen, SCHEEFSTAND_COMBO_OFFSET,
} = await import("./src/components/fem/solver/combinations.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
const dicht = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const E = 210000;
// Ingeklemde kolom (HEB300-achtig) met een console van 100 mm naar +x; P op
// de console, een kleine wind naar −x in een apart geval.
const kolom = (richting) => ({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 6000 }, { id: 3, x: 100, z: 6000 }],
  beams: [
    { id: 1, from: 1, to: 2, E, A: 11250, I: 2.517e8 },
    { id: 2, from: 2, to: 3, E, A: 11250, I: 2.517e8 },
  ],
  supports: [{ nodeId: 1, type: "fixed" }],
  cases: [{ id: 1, name: "G" }, { id: 4, name: "W" }],
  loads: [],
  pointLoads: [{ nodeId: 3, fz: -400000, caseId: 1 }, { nodeId: 2, fx: -1000, caseId: 4 }],
  scheefstand: richting ? { phi: 1 / 200, richting } : undefined,
});
const combos = [
  { id: 1, name: "1.2G+1.5W", type: "uls", formula: "", factors: new Map([[1, 1.2], [4, 1.5]]) },
  { id: 2, name: "1.35G", type: "uls", formula: "", factors: new Map([[1, 1.35]]) },
];
const maxM = (env, id) => Math.max(Math.abs(env.elements.get(id).M_min), Math.abs(env.elements.get(id).M_max)) / 1e6;

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] solveAllCases met scheefstand: elk geval tweemaal, met de markering");
{
  const { perCase } = solveAllCases(kolom(1));
  const sr = getScheefstandRichtingen(perCase);
  check("markering aanwezig: primair +1, offset = SCHEEFSTAND_ID_OFFSET", sr?.primair === 1 && sr?.offset === SCHEEFSTAND_ID_OFFSET);
  check("gevallen 1 en 4 onder hun eigen id én onder id + offset",
    perCase.has(1) && perCase.has(4) && perCase.has(1 + SCHEEFSTAND_ID_OFFSET) && perCase.has(4 + SCHEEFSTAND_ID_OFFSET));
  check("gevalResultaten laat alleen de gewone id's over", [...gevalResultaten(perCase).keys()].join(",") === "1,4");
  // De tegengestelde richting is exact de som die de motor met richting −1 geeft.
  const min = solveAllCases(kolom(-1)).perCase.get(1);
  const tegen = perCase.get(1 + SCHEEFSTAND_ID_OFFSET);
  check("tegengestelde set = de som met richting −1 (voetmoment gelijk)",
    dicht(min.reactions.get(1).my, tegen.reactions.get(1).my, 1e-6), `${min.reactions.get(1).my} vs ${tegen.reactions.get(1).my}`);
  check("zonder scheefstand: geen markering en geen extra gevallen",
    getScheefstandRichtingen(solveAllCases(kolom(0)).perCase) === undefined && solveAllCases(kolom(0)).perCase.size === 2);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] metScheefstandRichtingen: twee varianten per combinatie, richting in de naam");
{
  const uit = metScheefstandRichtingen(combos, true, 1);
  check("vier combinaties", uit.length === 4);
  check("primaire variant houdt id 1 en heet '… (scheefstand +x)'", uit[0].id === 1 && uit[0].name === "1.2G+1.5W (scheefstand +x)" && uit[0].scheefstandRichting === 1);
  check("tegengestelde variant: id + offset en '… (scheefstand −x)'", uit[1].id === 1 + SCHEEFSTAND_COMBO_OFFSET && uit[1].name === "1.2G+1.5W (scheefstand −x)" && uit[1].scheefstandRichting === -1);
  check("factoren gedeeld", uit[1].factors === combos[0].factors);
  check("uit = identiteit", metScheefstandRichtingen(combos, false, 1) === combos);
  check("idempotent: een al ontvouwde lijst wordt niet nog eens ontvouwd", metScheefstandRichtingen(uit, true, 1).length === 4);
  const om = metScheefstandRichtingen(combos, true, -1);
  check("primair −x: id 1 heet '(scheefstand −x)', de variant '+x'", om[0].name.endsWith("(scheefstand −x)") && om[1].name.endsWith("(scheefstand +x)"));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] combineResults per variant, en de omhullende neemt de ongunstigste — ongeacht de instelling");
for (const richting of [1, -1]) {
  const { perCase } = solveAllCases(kolom(richting));
  const varianten = metScheefstandRichtingen(combos, true, richting);
  const plus = varianten.find((c) => c.scheefstandRichting === 1 && c.factors === combos[1].factors);
  const min = varianten.find((c) => c.scheefstandRichting === -1 && c.factors === combos[1].factors);
  const mPlus = Math.abs(combineResults(plus, perCase).reactions.get(1).my) / 1e6;
  const mMin = Math.abs(combineResults(min, perCase).reactions.get(1).my) / 1e6;
  check(`instelling ${richting > 0 ? "+x" : "−x"}: 1.35G voetmoment +x = 70,20 kNm, −x = 37,80 kNm`, dicht(mPlus, 70.2, 1e-3) && dicht(mMin, 37.8, 1e-3), `${mPlus} / ${mMin}`);
  // Zonder ontvouwing: computeEnvelope ontvouwt zelf.
  const env = computeEnvelope(combos, perCase);
  check(`instelling ${richting > 0 ? "+x" : "−x"}: omhullende kolom 70,20 kNm`, dicht(maxM(env, 1), 70.2, 1e-3), `${maxM(env, 1)}`);
  // Met ontvouwing: hetzelfde.
  const env2 = computeEnvelope(varianten, perCase);
  check(`instelling ${richting > 0 ? "+x" : "−x"}: ontvouwde lijst geeft dezelfde omhullende`, dicht(maxM(env2, 1), maxM(env, 1), 1e-9));
  // Een combinatie zonder richting leest de primaire set: het oude gedrag.
  const kaal = Math.abs(combineResults(combos[1], perCase).reactions.get(1).my) / 1e6;
  check(`instelling ${richting > 0 ? "+x" : "−x"}: combinatie zonder richting = primaire richting`, dicht(kaal, richting > 0 ? 70.2 : 37.8, 1e-3), `${kaal}`);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Tweede orde (P-Δ): per variant de eigen richting; omhullende 86,52 kNm bij beide instellingen");
for (const richting of [1, -1]) {
  const { perCase } = solveAllCasesNonlinear(kolom(richting));
  const env = computeEnvelope(combos, perCase);
  check(`instelling ${richting > 0 ? "+x" : "−x"}: omhullende kolom 86,52 kNm`, dicht(maxM(env, 1), 86.52, 5e-3), `${maxM(env, 1)}`);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Zonder scheefstand: omhullende 54,00 kNm, geen varianten");
{
  const { perCase } = solveAllCases(kolom(0));
  const env = computeEnvelope(combos, perCase);
  check("omhullende 54,00 kNm", dicht(maxM(env, 1), 54.0, 1e-3), `${maxM(env, 1)}`);
}

log(`\n${"─".repeat(50)}`);
log(`Resultaat: ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
