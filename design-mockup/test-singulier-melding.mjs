// Singulier stelsel: dezelfde Nederlandse melding op het raamwerkpad en op
// het gemengde pad (staven + wandschijven) — basisaudit nr 31.
//
// WAAROM DEZE TEST BESTAAT
// De stelseloplosser meldt alleen "Matrix is singular or nearly singular at
// column N". Het raamwerkpad vertaalt dat sinds golf 1 naar knoop, richting
// en oorzaak. Het gemengde pad deed dat tot september 2026 niet: hetzelfde
// vakwerk met een losse wandschijf ernaast gaf nog "column 5". De gebruiker
// zag dan, afhankelijk van of er ergens een schijf in het model stond, een
// bruikbare of een onbruikbare melding voor precies dezelfde modelfout.
//
// Het gemengde pad nummert alleen de ACTIEVE knopen (buildNodeIdToIndex), het
// raamwerkpad alle knopen op volgorde; kolom 5 is dus niet vanzelf dezelfde
// knoop. De vertaling krijgt daarom per pad zijn eigen kolom-naar-knooptabel.
//
// Modellen (uit de meting):
//   1. vakwerkknoop: twee staven met een scharnier aan de knoopzijde, de knoop
//      zelf zonder rotatiesteun → rotatie vrij, exact N = −14,142 kN als de
//      knoop wél vastgehouden werd;
//   2. pendelstaaf met een scharnier op een scharnieroplegging;
//   3. losse knoop (raamwerkpad; het gemengde pad laat een inactieve knoop
//      buiten het stelsel, en de modelcontrole meldt hem vooraf).
//
// Draaien met: npx tsx test-singulier-melding.mjs  (ook tegen de sidecarbundel)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}

const st = (id, from, to, extra = {}) => ({ id, from, to, material: "S235", profile: "HEA160", ...extra });
const basis = {
  loadCases: [{ id: 1, name: "G", type: "dead" }],
  selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
};
// Losse wandschijf ver weg, onderrand ingeklemd: alleen om het gemengde pad te
// forceren. Ze hangt aan niets en draagt niets.
const schijfKnopen = [{ id: 11, x: 20000, z: 0 }, { id: 12, x: 21000, z: 0 }, { id: 13, x: 21000, z: 1000 }, { id: 14, x: 20000, z: 1000 }];
const schijf = [{ id: 1, nodeIds: [11, 12, 13, 14], thickness: 200, meshSize: 500 }];
const schijfSteun = [{ nodeId: 11, type: "fixed" }, { nodeId: 12, type: "fixed" }];

function melding(model) {
  try { solveAllCases(bouwMultiInput(model)); return null; }
  catch (e) { return e.message; }
}

const vakwerk = (metSchijf) => ({
  ...basis,
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 3000, z: 3000 }, { id: 3, x: 6000, z: 0 }, ...(metSchijf ? schijfKnopen : [])],
  beams: [st(1, 1, 2, { releases: { endRy: true } }), st(2, 2, 3, { releases: { startRy: true } })],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "pinned" }, ...(metSchijf ? schijfSteun : [])],
  plates: metSchijf ? schijf : [],
  loads: [{ id: 1, type: "pointForce", caseId: 1, nodeId: 2, fz: -20 }],
});

const pendel = (metSchijf) => ({
  ...basis,
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 0, z: 3000 }, { id: 3, x: 4000, z: 3000 }, { id: 4, x: 4000, z: 0 },
    ...(metSchijf ? schijfKnopen : [])],
  beams: [st(1, 1, 2), st(2, 2, 3), st(3, 4, 3, { releases: { startRy: true, endRy: true } })],
  supports: [{ nodeId: 1, type: "fixed" }, { nodeId: 4, type: "pinned" }, ...(metSchijf ? schijfSteun : [])],
  plates: metSchijf ? schijf : [],
  loads: [{ id: 1, type: "pointForce", caseId: 1, nodeId: 2, fx: 10 }],
});

const losseKnoop = (metSchijf) => ({
  ...basis,
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 9, x: 1000, z: 2000 }, ...(metSchijf ? schijfKnopen : [])],
  beams: [st(1, 1, 2, { profile: "IPE300" })],
  supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, ...(metSchijf ? schijfSteun : [])],
  plates: metSchijf ? schijf : [],
  loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -10 }],
});

log("\n[1] Vakwerkknoop: rotatie vrij op knoop 2");
{
  const raam = melding(vakwerk(false));
  const gemengd = melding(vakwerk(true));
  ok("raamwerkpad weigert", raam !== null);
  ok("gemengd pad weigert", gemengd !== null);
  ok("raamwerkpad noemt knoop 2 en 'draaien'", /knoop 2 op \(3000, 3000\) mm kan vrij draaien/.test(raam ?? ""), raam ?? "");
  ok("gemengd pad noemt knoop 2 en 'draaien' (was: column 5)", /knoop 2 op \(3000, 3000\) mm kan vrij draaien/.test(gemengd ?? ""), gemengd ?? "");
  ok("gemengd pad noemt het scharnier als oorzaak", /scharnier \(release Ry\)/.test(gemengd ?? ""));
  ok("beide paden: zelfde melding tot aan de oorspronkelijke kolom",
    (raam ?? "").replace(/column \d+/, "") === (gemengd ?? "").replace(/column \d+/, ""),
    `\n    raam:    ${raam}\n    gemengd: ${gemengd}`);
}

log("\n[2] Pendelstaaf met scharnier op een scharnieroplegging: knoop 4");
{
  const raam = melding(pendel(false));
  const gemengd = melding(pendel(true));
  ok("raamwerkpad noemt knoop 4", /knoop 4 op \(4000, 0\) mm kan vrij draaien/.test(raam ?? ""), raam ?? "");
  ok("gemengd pad noemt knoop 4", /knoop 4 op \(4000, 0\) mm kan vrij draaien/.test(gemengd ?? ""), gemengd ?? "");
  ok("gemengd pad wijst op de scharnieroplegging", /scharnieroplegging/.test(gemengd ?? ""));
}

log("\n[3] Losse knoop");
{
  const raam = melding(losseKnoop(false));
  ok("raamwerkpad: knoop 9 kan vrij verschuiven, losse knoop", /knoop 9 op \(1000, 2000\) mm kan vrij horizontaal verschuiven/.test(raam ?? "") && /losse knoop/.test(raam ?? ""), raam ?? "");
  // Het gemengde pad neemt alleen actieve knopen op; de losse knoop staat er
  // buiten en de ligger rekent gewoon door. De modelcontrole en valideerModel
  // melden de losse knoop vooraf (test-modelcontrole, test-validatie-mcp).
  const gemengd = melding(losseKnoop(true));
  ok("gemengd pad: ligger rekent door (losse knoop is niet actief)", gemengd === null, gemengd ?? "");
}

log("\n[4] Een geldig gemengd model blijft gewoon rekenen");
{
  const m = vakwerk(true);
  m.beams[0].releases = {}; // één staaf star aansluiten
  const r = solveAllCases(bouwMultiInput(m)).perCase.get(1);
  const N = r.elements.get(2).N;
  ok("N in staaf 2 ≈ −14,142 kN (druk, trek-positief op de adapterrand)", Math.abs(N + 14142) < 150, `${N} N`);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
