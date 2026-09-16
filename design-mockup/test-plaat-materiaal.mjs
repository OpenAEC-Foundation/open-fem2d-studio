// Materiaalkeuze per plaat (stap 3 van het platenspoor): uit de
// materiaalnaam volgen E, ν en ρ, hout en kruislaaghout rekenen
// richtingsafhankelijk, en een onbekend materiaal wordt geweigerd.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] BESTAANDE MODELLEN VERANDEREN NIET. Een plaat ZONDER `materiaal`
//       levert dezelfde solverinvoer (sleutel voor sleutel, in dezelfde
//       volgorde) en dezelfde stijfheid als voorheen. Een plaat MET
//       "S235" — waarvan E, ν en ρ per definitie de oude staaldefaults zijn —
//       geeft BIT-GELIJKE verplaatsingen, reacties en elementspanningen.
//   [2] ORTHOTROPE SCHIJF ONDER TREK, tegen de analytische rek. C24 in het
//       vlak (EN 338): E₀ = 11 000, E₉₀ = 370, G = 690 N/mm², ν₁₂ = 0.
//       Bij ν₁₂ = 0 is een eenassige trekspanning een exacte oplossing van
//       het vlakspanningsprobleem (geen dwarscontractie, dus geen
//       randstoring), en dan geldt exact:
//           u = σ·L/E    met σ = p/t
//       Verticale trek op een wand 2000 × 3000 × 20 mm met p = 10 N/mm,
//       dus σ = 0,5 N/mm²:
//           hoofdrichting 0°  → verticaal is richting 2 →
//                               u = 0,5·3000/370    = 4,054054054… mm
//           hoofdrichting 90° → verticaal is richting 1 →
//                               u = 0,5·3000/11000  = 0,136363636… mm
//       Horizontale trek over 2000 mm:
//           hoofdrichting 0°  → u = 0,5·2000/11000  = 0,090909090… mm
//           hoofdrichting 90° → u = 0,5·2000/370    = 2,702702702… mm
//   [3] 90° WISSELT DE HOOFDRICHTINGEN OM: de verhouding van de twee
//       verticale zakkingen is exact E₀/E₉₀ = 11000/370 = 29,7297…
//   [4] EIGEN GEWICHT = ρ·t·A, met de ρ van het MATERIAAL.
//       Wand 2000 × 3000 mm, t = 20 mm → A·t = 6,0 m² · 0,02 m = 0,12 m³.
//           zonder materiaal (ρ = 7850): 7850·9,81·0,12 = 9241,02 N
//           C24        (ρ_mean = 420):    420·9,81·0,12 =  494,424 N
//           ρ handmatig 500:              500·9,81·0,12 =  588,6   N
//   [5] KRUISLAAGHOUT in het vlak, uitgesmeerd over de dikte.
//       "CLT C24 40/20/40/20/40": lengtelagen 40+40+40 = 120 mm,
//       dwarslagen 20+20 = 40 mm, totaal 160 mm.
//           E₁ = (120·11000 + 40·370)/160 = 1 334 800/160 = 8342,5 N/mm²
//           E₂ = (120·370 + 40·11000)/160 =   484 400/160 = 3027,5 N/mm²
//           G₁₂ = 690 (alle lagen C24), ρ = 420 kg/m³
//   [6] WEIGERINGEN met reden, langs alle drie de wegen: de bepaling zelf,
//       de MCP-veldpoort (`valideerModel`) en de berekening (`solveAllCases`).
//       Een onbekende naam, een kruislaaghoutopbouw zonder sterkteklasse en
//       een onvolledig vrij materiaal.
//   [7] OVERSCHRIJVEN. Een handmatige E geldt in BEIDE richtingen (de plaat
//       rekent dan isotroop), een handmatige ν en ρ vervangen alleen zichzelf,
//       en de bron van elk getal is per grootheid te lezen.
//   [8] SPIEGELTEST op de houttabellen: E_0,mean, E_90,mean, G_mean en
//       ρ_mean naast de kern (`nen-en-1995-1-1/src/data.rs`), die de TOETSING
//       bedient. Lopen ze uiteen, dan rekent de solver een andere plaat door
//       dan de toetsing er later op loslaat.
//
// Uitvoeren: npx tsx test-plaat-materiaal.mjs   (vanuit design-mockup/)

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { plaatNaarSolverInput, bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { withPlateDefaults } = await import("./src/components/fem/femTypes.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const {
  bepaalPlaatStijfheid, keurPlaatMateriaal, cltVlakStijfheid, ontleedPlaatClt,
} = await import("./src/lib/plaatMateriaal.ts");
const {
  TIMBER_E_MEAN, TIMBER_E90_MEAN, TIMBER_G_MEAN, TIMBER_RHO_MEAN,
} = await import("./src/lib/sectionResolver.ts");
const { readFileSync } = await import("node:fs");
const { fileURLToPath } = await import("node:url");
const { dirname, join } = await import("node:path");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
function checkRel(name, actual, expected, tolRel, scale = null) {
  const s = scale ?? Math.abs(expected);
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolRel * s;
  checkTrue(name, ok, `${Number(actual).toExponential(9)} ≈ ${Number(expected).toExponential(9)}`);
}
function weigert(name, f, patroon) {
  try { f(); checkTrue(name, false, "geen fout"); }
  catch (e) { checkTrue(name, patroon.test(e.message), e.message); }
}
const eenGeval = (mi) => solveAllCases(mi).perCase.get(1);
const elementen = (r, plateId = 1) => r.plateElements.find((p) => p.plateId === plateId).elements;

// Valversnelling zoals de kern hem gebruikt (PlateLoads.STANDARD_GRAVITY).
// Bewust hier herhaald en niet geïmporteerd: dan kan deze test ook tegen de
// sidecarbundel draaien, waarin PlateRegion/PlateLoads niet zit.
const G = 9.81;
const B = 2000, H = 3000, T = 20, S = 500;   // mm
const SIGMA = 0.5;                            // N/mm² → randlast p = σ·t = 10 N/mm

// ─────────────────────────────────────────────────────────────────────────
// Modellen: een rechthoekige wand met UI-knopen op alle gridposities van de
// belaste en de gesteunde rand, statisch bepaald opgelegd zodat de
// dwarscontractie vrij is.
// ─────────────────────────────────────────────────────────────────────────
/** Verticale trek: onderrand op rollen (midden scharnier), trek op de bovenrand. */
function trekVerticaal(plaatExtra = {}, lastGeval = true) {
  const nx = B / S, nodes = [];
  for (let i = 0; i <= nx; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });
  const tl = nx + 2, tr = nx + 3, tm = nx + 4;
  nodes.push({ id: tl, x: 0, z: H }, { id: tr, x: B, z: H }, { id: tm, x: (nx / 2) * S, z: H });
  const midden = 1 + nx / 2;
  return {
    nodes, beams: [],
    supports: nodes.slice(0, nx + 1).map((n) =>
      ({ nodeId: n.id, type: n.id === midden ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{ id: 1, nodeIds: [1, nx + 1, tr, tl], thickness: T, meshSize: S, ...plaatExtra }],
    ...(lastGeval
      ? { edgeLoads: [{ plateId: 1, caseId: 1, edge: "top", p: SIGMA * T, dir: "z" }] }
      : {}),
    cases: [{ id: 1, name: "Q" }],
    topMidden: tm,
  };
}
/** Horizontale trek: linkerrand op rollen (midden scharnier), trek op de rechterrand. */
function trekHorizontaal(plaatExtra = {}) {
  const nz = H / S, nodes = [];
  for (let j = 0; j <= nz; j++) nodes.push({ id: 1 + j, x: 0, z: j * S });
  const br = nz + 2, tr = nz + 3, rm = nz + 4;
  nodes.push({ id: br, x: B, z: 0 }, { id: tr, x: B, z: H }, { id: rm, x: B, z: (nz / 2) * S });
  const midden = 1 + nz / 2;
  return {
    nodes, beams: [],
    supports: nodes.slice(0, nz + 1).map((n) =>
      ({ nodeId: n.id, type: n.id === midden ? "pinned" : "xRoller" })),
    loads: [],
    plates: [{ id: 1, nodeIds: [1, br, tr, nz + 1], thickness: T, meshSize: S, ...plaatExtra }],
    edgeLoads: [{ plateId: 1, caseId: 1, edge: "right", p: SIGMA * T, dir: "x" }],
    cases: [{ id: 1, name: "Q" }],
    rechtsMidden: rm,
  };
}
const somR = (r, comp) => {
  let s = 0;
  for (const [, re] of r.reactions) s += re[comp];
  return s;
};

// ═════════════════════════════════════════════════════════════════════════
log("\n[1] Bestaande modellen veranderen niet");
// ─────────────────────────────────────────────────────────────────────────
{
  // (a) De solverinvoer van een plaat zonder materiaal is sleutel voor
  //     sleutel dezelfde als vóór stap 3 — ook de volgorde, want die bepaalt
  //     de JSON die de MCP-weg over de lijn stuurt.
  const oud = plaatNaarSolverInput({ id: 7, nodeIds: [1, 2, 3, 4] });
  checkTrue("plaat zonder materiaal → onveranderde solverinvoer",
    JSON.stringify(oud) === JSON.stringify({
      id: 7, nodeIds: [1, 2, 3, 4], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500,
    }), JSON.stringify(oud));
  // (b) `withPlateDefaults` vult zonder materiaal nog steeds alles aan.
  const d = withPlateDefaults({ id: 1, nodeIds: [1, 2, 3, 4] });
  checkTrue("withPlateDefaults zonder materiaal: staaldefaults",
    d.E === 210000 && d.nu === 0.3 && d.rho === 7850 && d.thickness === 20 && d.meshSize === 500);
  // (c) ... en LAAT ZE LEEG zodra er een materiaal staat, zodat een leeg veld
  //     "volg het materiaal" betekent en niet stil 210 000 wordt.
  const dm = withPlateDefaults({ id: 1, nodeIds: [1, 2, 3, 4], materiaal: "C24" });
  checkTrue("withPlateDefaults mét materiaal: E/ν/ρ blijven leeg",
    dm.E === undefined && dm.nu === undefined && dm.rho === undefined
    && dm.thickness === 20 && dm.meshSize === 500);
  // (d) De stijfheid van een plaat zonder materiaal is precies haar eigen E.
  const st = bepaalPlaatStijfheid({ E: 210000, nu: 0.3, rho: 7850 });
  checkTrue("zonder materiaal: isotroop met de eigen getallen",
    st.ok && st.stijfheid.soort === null && st.stijfheid.orthotroop === false
    && st.stijfheid.E1 === 210000 && st.stijfheid.E2 === 210000
    && st.stijfheid.nu12 === 0.3 && st.stijfheid.rho === 7850);
}
{
  // (e) Bit-gelijke uitkomst: "S235" levert per definitie 210 000 / 0,3 /
  //     7850 — dezelfde getallen als de staaldefaults — en is isotroop, dus
  //     het materiaal komt door exact dezelfde formules als voorheen.
  const zonder = eenGeval(trekVerticaal({ E: 210000, nu: 0.3, rho: 7850 }));
  const met = eenGeval(trekVerticaal({ materiaal: "S235" }));
  let gelijk = true, aantal = 0;
  for (const [id, u] of zonder.displacements) {
    const v = met.displacements.get(id);
    if (!v || !Object.is(u.ux, v.ux) || !Object.is(u.uz, v.uz)) gelijk = false;
    aantal++;
  }
  checkTrue(`verplaatsingen bit-gelijk (${aantal} knopen)`, gelijk);
  let rGelijk = true, rAantal = 0;
  for (const [id, re] of zonder.reactions) {
    const v = met.reactions.get(id);
    if (!v || !Object.is(re.fx, v.fx) || !Object.is(re.fz, v.fz)) rGelijk = false;
    rAantal++;
  }
  checkTrue(`reacties bit-gelijk (${rAantal} opleggingen)`, rGelijk);
  const a = elementen(zonder), b = elementen(met);
  let sGelijk = a.length === b.length && a.length > 0;
  for (let i = 0; i < a.length && sGelijk; i++) {
    if (!Object.is(a[i].sigmaX, b[i].sigmaX) || !Object.is(a[i].sigmaY, b[i].sigmaY)
      || !Object.is(a[i].tauXY, b[i].tauXY)) sGelijk = false;
  }
  checkTrue(`elementspanningen bit-gelijk (${a.length} elementen)`, sGelijk);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[2] Orthotrope schijf onder trek: u = σ·L/E in beide hoofdrichtingen");
// ─────────────────────────────────────────────────────────────────────────
{
  const gevallen = [
    ["verticaal, 0° (dwars op de vezel)", trekVerticaal({ materiaal: "C24" }), "uz", "topMidden", SIGMA * H / 370],
    ["verticaal, 90° (langs de vezel)", trekVerticaal({ materiaal: "C24", hoofdrichting: 90 }), "uz", "topMidden", SIGMA * H / 11000],
    ["horizontaal, 0° (langs de vezel)", trekHorizontaal({ materiaal: "C24" }), "ux", "rechtsMidden", SIGMA * B / 11000],
    ["horizontaal, 90° (dwars op de vezel)", trekHorizontaal({ materiaal: "C24", hoofdrichting: 90 }), "ux", "rechtsMidden", SIGMA * B / 370],
  ];
  for (const [naam, mi, comp, knoopVeld, verwacht] of gevallen) {
    const r = eenGeval(mi);
    checkRel(`${naam}: u = σ·L/E`, r.displacements.get(mi[knoopVeld])[comp], verwacht, 1e-9);
    // Eenassige spanningstoestand: in ELK element σ = p/t in de lastrichting
    // en nul in de andere twee componenten. Exact, want beide elementtypen
    // bevatten het lineaire verplaatsingsveld.
    const els = elementen(r);
    const langs = comp === "uz" ? "sigmaY" : "sigmaX";
    const dwars = comp === "uz" ? "sigmaX" : "sigmaY";
    let maxFout = 0;
    for (const el of els) {
      maxFout = Math.max(maxFout, Math.abs(el[langs] - SIGMA), Math.abs(el[dwars]), Math.abs(el.tauXY));
    }
    checkRel(`${naam}: σ = ${SIGMA} N/mm² in elk element, rest nul`, SIGMA + maxFout, SIGMA, 1e-9);
  }
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[3] Hoofdrichting 90° wisselt E₁ en E₂ om");
// ─────────────────────────────────────────────────────────────────────────
{
  const u0 = eenGeval(trekVerticaal({ materiaal: "C24" })).displacements.get(8).uz;
  const u90 = eenGeval(trekVerticaal({ materiaal: "C24", hoofdrichting: 90 })).displacements.get(8).uz;
  checkRel("u(0°)/u(90°) = E₀/E₉₀ = 11000/370", u0 / u90, 11000 / 370, 1e-9);
  // Een halve draai verandert niets: 180° wijst richting 1 weer langs x.
  const u180 = eenGeval(trekVerticaal({ materiaal: "C24", hoofdrichting: 180 })).displacements.get(8).uz;
  checkRel("u(180°) = u(0°)", u180, u0, 1e-9);
  // Een isotroop materiaal trekt zich van de hoofdrichting niets aan.
  const s0 = eenGeval(trekVerticaal({ materiaal: "S355" })).displacements.get(8).uz;
  const s45 = eenGeval(trekVerticaal({ materiaal: "S355", hoofdrichting: 45 })).displacements.get(8).uz;
  checkTrue("staal: hoofdrichting heeft geen invloed (bit-gelijk)", Object.is(s0, s45));
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[4] Eigen gewicht = ρ·t·A, met de ρ van het materiaal");
// ─────────────────────────────────────────────────────────────────────────
{
  const volume = (B / 1000) * (H / 1000) * (T / 1000);   // 0,12 m³
  const proeven = [
    ["zonder materiaal (ρ = 7850)", { E: 210000, nu: 0.3, rho: 7850 }, 7850],
    ["C24 (ρ_mean = 420)", { materiaal: "C24" }, 420],
    ["C30/37 (gewapend beton, ρ = 2500)", { materiaal: "C30/37" }, 2500],
    ["C24 met ρ handmatig 500", { materiaal: "C24", rho: 500 }, 500],
    ["vrij materiaal (ρ uit de naam)", { materiaal: "VRIJ:Natuursteen E=60000 rho=2700 f=8" }, 2700],
  ];
  for (const [naam, plaat, rho] of proeven) {
    const mi = trekVerticaal({ ...plaat, selfWeightCaseId: 1 }, false);
    const r = eenGeval(mi);
    checkRel(`${naam}: ΣRz = ρ·g·t·A`, somR(r, "fz"), rho * G * volume, 1e-9);
  }
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[5] Kruislaaghout in het vlak, uitgesmeerd over de dikte");
// ─────────────────────────────────────────────────────────────────────────
{
  const uit = ontleedPlaatClt("CLT C24 40/20/40/20/40");
  checkTrue("opbouw gelezen: 5 lagen, klasse C24 vóór de opbouw",
    !("fout" in uit) && uit.layup.layers.length === 5
    && uit.layup.layers.every((l) => l.strength_class === "C24")
    && uit.standaardKlasse === "C24");
  const v = cltVlakStijfheid(uit.layup);
  checkRel("E₁ = (120·11000 + 40·370)/160", v.E1, 1334800 / 160, 1e-12);
  checkRel("E₂ = (120·370 + 40·11000)/160", v.E2, 484400 / 160, 1e-12);
  checkRel("G₁₂ = 690 (alle lagen C24)", v.G12, 690, 1e-12);
  checkRel("ρ = 420 (alle lagen C24)", v.rho, 420, 1e-12);
  // En de schijf rekent er ook mee: verticale trek met richting 1 langs x.
  // Sinds issue #14 vraagt kruislaaghout een G₁₂-keuze; bij eenassige trek
  // met ν₁₂ = 0 doet G₁₂ niet mee, dus de bovengrens verandert hier niets.
  const r = eenGeval(trekVerticaal({ materiaal: "CLT C24 40/20/40/20/40", cltG12Bovengrens: true }));
  checkRel("verticale trek: u = σ·h/E₂", r.displacements.get(8).uz, SIGMA * H / (484400 / 160), 1e-9);
  // De staafgrammatica (klasse per laag) moet hetzelfde opleveren.
  const perLaag = ontleedPlaatClt("CLT 40:C24/20:C24/40:C24/20:C24/40:C24");
  checkTrue("klasse per laag geeft dezelfde opbouw",
    !("fout" in perLaag)
    && JSON.stringify(cltVlakStijfheid(perLaag.layup)) === JSON.stringify(v));
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[6] Weigeringen met reden — langs alle drie de wegen");
// ─────────────────────────────────────────────────────────────────────────
{
  const onmogelijk = [
    ["onbekende naam", "C4", /wordt niet herkend/],
    ["houtachtige tikfout", "C240", /wordt niet herkend/],
    ["kruislaaghout zonder sterkteklasse", "CLT 40/20/40", /geen sterkteklasse/],
    ["kruislaaghout met onbekende klasse", "CLT D40 40/20/40", /niet te lezen|geen sterkteklasse|geen bekende sterkteklasse/],
    ["kruislaaghout zonder opbouw", "CLT", /mist de laagopbouw/],
    ["onvolledig vrij materiaal", "VRIJ:Natuursteen E=60000", /niet volledig/],
  ];
  for (const [naam, materiaal, patroon] of onmogelijk) {
    const reden = keurPlaatMateriaal(materiaal);
    checkTrue(`${naam}: geweigerd met reden`, reden !== null && patroon.test(reden), reden ?? "GEEN reden");
  }
  // De MCP-veldpoort weigert hetzelfde ...
  const model = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 }, { id: 3, x: 2000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
    beams: [], supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    loads: [], loadCases: [{ id: 1, name: "Q", type: "live" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 20, meshSize: 500, materiaal: "C4" }],
  };
  const keuring = valideerModel(model);
  checkTrue("valideerModel weigert het onbekende materiaal",
    !keuring.ok && keuring.errors.some((f) => /materiaal/.test(f) && /niet herkend/.test(f)),
    (keuring.errors ?? []).join(" | "));
  const goed = valideerModel({ ...model, plates: [{ ...model.plates[0], materiaal: "C24" }] });
  checkTrue("... en laat een bekende houtklasse door", goed.ok, (goed.errors ?? []).join(" | "));
  const onbekendVeld = valideerModel({
    ...model, plates: [{ ...model.plates[0], materiaal: "C24", hoofdricht: 90 }],
  });
  checkTrue("... en weigert nog steeds een onbekend veld",
    !onbekendVeld.ok && onbekendVeld.errors.some((f) => /hoofdricht/.test(f)),
    (onbekendVeld.errors ?? []).join(" | "));
  // ... en de berekening zelf stopt in plaats van stil staal aan te nemen.
  weigert("solveAllCases weigert het onbekende materiaal",
    () => solveAllCases(trekVerticaal({ materiaal: "C4" })),
    /Plaat 1: .*niet herkend/);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[7] Overschrijven met de losse velden, met de bron erbij");
// ─────────────────────────────────────────────────────────────────────────
{
  const puur = bepaalPlaatStijfheid({ materiaal: "C24" });
  // Sinds issue #14 heet de bron van ν₁₂ = 0 bij hout "aanname": de norm
  // geeft geen dwarscontractie, dus het is geen materiaalwaarde.
  checkTrue("C24 zonder overschrijving: orthotroop, E/G/ρ uit het materiaal, ν₁₂ = 0 als aanname",
    puur.ok && puur.stijfheid.orthotroop
    && puur.stijfheid.E1 === 11000 && puur.stijfheid.E2 === 370
    && puur.stijfheid.G12 === 690 && puur.stijfheid.nu12 === 0 && puur.stijfheid.rho === 420
    && puur.stijfheid.bronE === "materiaal" && puur.stijfheid.bronNu === "aanname"
    && puur.stijfheid.bronRho === "materiaal");
  const metE = bepaalPlaatStijfheid({ materiaal: "C24", E: 9000 });
  checkTrue("handmatige E geldt in BEIDE richtingen en maakt de plaat isotroop",
    metE.ok && metE.stijfheid.orthotroop === false
    && metE.stijfheid.E1 === 9000 && metE.stijfheid.E2 === 9000
    && metE.stijfheid.G12 === 9000 / 2 && metE.stijfheid.bronE === "handmatig"
    && metE.stijfheid.rho === 420 && metE.stijfheid.bronRho === "materiaal");
  const metNu = bepaalPlaatStijfheid({ materiaal: "C24", nu: 0.2 });
  checkTrue("handmatige ν vervangt alleen ν₁₂",
    metNu.ok && metNu.stijfheid.orthotroop && metNu.stijfheid.nu12 === 0.2
    && metNu.stijfheid.E1 === 11000 && metNu.stijfheid.bronNu === "handmatig");
  const staal = bepaalPlaatStijfheid({ materiaal: "S355" });
  checkTrue("staal: E en ν uit NEN-EN 1993-1-1 3.2.6(1), ρ uit NEN-EN 1991-1-1 tabel A.4",
    staal.ok && staal.stijfheid.E1 === 210000 && staal.stijfheid.nu12 === 0.3
    && staal.stijfheid.rho === 7850 && staal.stijfheid.orthotroop === false);
  const beton = bepaalPlaatStijfheid({ materiaal: "C30/37" });
  checkTrue("beton C30/37: E_cm = 33000 (tabel 3.1), ν = 0,2 (3.1.3(4)), ρ = 2500",
    beton.ok && beton.stijfheid.E1 === 33000 && beton.stijfheid.nu12 === 0.2
    && beton.stijfheid.rho === 2500 && beton.stijfheid.orthotroop === false);
  // De E-overschrijving is ook in de SOLVER te meten: dezelfde wand met C24
  // en E = 210000 zakt precies zoveel als de stalen wand.
  const houtMetStaalE = eenGeval(trekVerticaal({ materiaal: "C24", E: 210000 })).displacements.get(8).uz;
  const stalen = eenGeval(trekVerticaal({ materiaal: "S235" })).displacements.get(8).uz;
  checkRel("C24 met E = 210000 zakt als staal (isotroop geworden)", houtMetStaalE, stalen, 1e-12);
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[8] Spiegeltest: de houttabellen naast de kern (data.rs)");
// ─────────────────────────────────────────────────────────────────────────
{
  const hier = dirname(fileURLToPath(import.meta.url));
  const pad = join(hier, "..", "src-tauri", "crates", "nen-en-1995-1-1", "src", "data.rs");
  const bron = readFileSync(pad, "utf8");
  // softwood("C24", f_mk, f_t0k, f_t90k, f_c0k, f_c90k, f_vk, e0, e005, e90, g, rho_k, rho_mean)
  const regels = [...bron.matchAll(/(?:softwood|glulam)\("([^"]+)",((?:\s*[\d.]+,){11}\s*[\d.]+)\)/g)];
  checkTrue("data.rs gelezen (13 sterkteklassen)", regels.length === 13, `${regels.length}`);
  // ρ_mean wijkt bij GL32h en GL36h bewust af: data.rs meldt dat zelf als een
  // openstaand punt waarvoor EN 14080 nodig is (480/490 daar, 490/500 hier).
  // Dat verschil raakt alleen het eigen gewicht en staat hier vastgelegd
  // zodat het opvalt zodra het wordt opgelost — het wordt niet verborgen.
  const rhoAfwijking = { GL32h: 480, GL36h: 490 };
  let fout = [];
  for (const m of regels) {
    const naam = m[1];
    const g = m[2].split(",").map((s) => Number(s.trim()));
    const [, , , , , , e0, , e90, gm, , rhoMean] = g;
    if (TIMBER_E_MEAN[naam] !== e0) fout.push(`${naam} E_0,mean ${TIMBER_E_MEAN[naam]} ≠ ${e0}`);
    if (TIMBER_E90_MEAN[naam] !== e90) fout.push(`${naam} E_90,mean ${TIMBER_E90_MEAN[naam]} ≠ ${e90}`);
    if (TIMBER_G_MEAN[naam] !== gm) fout.push(`${naam} G_mean ${TIMBER_G_MEAN[naam]} ≠ ${gm}`);
    const rhoVerwacht = rhoAfwijking[naam] ?? rhoMean;
    if (rhoMean !== rhoVerwacht) fout.push(`${naam} ρ_mean in data.rs is ${rhoMean}, verwacht ${rhoVerwacht}`);
    const rhoHier = rhoAfwijking[naam] !== undefined ? TIMBER_RHO_MEAN[naam] : rhoMean;
    if (TIMBER_RHO_MEAN[naam] !== rhoHier) fout.push(`${naam} ρ_mean ${TIMBER_RHO_MEAN[naam]} ≠ ${rhoHier}`);
  }
  checkTrue("E_0,mean, E_90,mean, G_mean en ρ_mean gelijk aan de kern",
    fout.length === 0, fout.join("; "));
}

// ═════════════════════════════════════════════════════════════════════════
log("\n[9] Doorvoer: materiaal reist mee door bouwMultiInput");
// ─────────────────────────────────────────────────────────────────────────
{
  const model = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 2000, z: 0 }, { id: 3, x: 2000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
    beams: [], supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 20, meshSize: 500, materiaal: "C24", hoofdrichting: 90 }],
    loads: [], loadCases: [{ id: 1, name: "Q", type: "live" }],
  };
  const mi = bouwMultiInput(model);
  checkTrue("materiaal en hoofdrichting staan in de solverinvoer",
    mi.plates[0].materiaal === "C24" && mi.plates[0].hoofdrichting === 90
    && mi.plates[0].E === undefined && mi.plates[0].nu === undefined && mi.plates[0].rho === undefined,
    JSON.stringify(mi.plates[0]));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
