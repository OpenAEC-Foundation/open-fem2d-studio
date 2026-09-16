// Verlopende profielen — deel 3: SPLITSEN, de keuring in de interface en de
// naam van de doorsnede.
//
// WAT HIER BEWEZEN WORDT
//   [1] Splitsen maakt van één verlopende staaf TWEE verlopende staven, met
//       de geïnterpoleerde doorsnede op de splitsplaats als eind resp. begin.
//   [2] De doorsnedefunctie verandert daarbij op geen enkele plaats: A(x) en
//       I(x) van de twee delen samen zijn die van de hele staaf.
//   [3] De SOLVER geeft dezelfde getallen. Dat wordt gemeten op een staaf
//       waarvan de segmentindeling van het geheel en van de delen samenvalt,
//       zodat er geen tweede verschil in het spel is; zie de noot hieronder.
//   [4] Een PRISMATISCHE staaf verandert niet: geen eindprofiel erbij, geen
//       eigen doorsnede bewaard, dezelfde uitkomst.
//   [5] De profielkiezer weigert een eindprofiel van een andere doorsnedesoort
//       met de reden van `bepaalVerloop` — niet met een tweede, eigen tekst.
//   [6] Het projectbestand bewaart begin én eind over opslaan en openen, ook
//       voor de eigen gelaste doorsnede die het splitsen achterlaat.
//   [7] De grootheden van die gelaste tussendoorsnede tegen de hand, én tegen
//       de doorsnedefunctie waarmee de solver het verloop rekent.
//   [8] Na het splitsen is de stalen staaf nog steeds te TOETSEN: beide delen
//       komen in de toetsinvoer en de tussendoorsnede reist als geometrie mee.
//
// ── WAAROM DE STAAF IN [3] KORT IS ──────────────────────────────────────────
//
// De solver deelt een verlopende staaf op in n = min(20, ⌊L/25 mm⌋) stukken en
// geeft elk stuk de doorsnede van zijn MIDDEN. Splitst men een staaf van 6 m,
// dan krijgt het geheel 20 stukken van 300 mm en krijgen de delen samen 40
// stukken van 120 en 180 mm: een FIJNERE benadering van dezelfde I(x), en dus
// een iets ander getal. Dat verschil komt van de opdeling en niet van het
// splitsen — het is de benaderingsfout die test-verlopend-profiel [6] al meet.
//
// Om te bewijzen dat het SPLITSEN zelf niets verandert, moet die tweede bron
// weg. Bij L ≤ 500 mm is n = ⌊L/25⌋ en niet 20; bij L = 500 mm krijgt het
// geheel dus 20 stukken van 25 mm en krijgt elke helft er 10 van 25 mm. De
// stukgrenzen — en daarmee alle 420 rekenstations — vallen dan exact samen, en
// wat er overblijft is zuiver het effect van het splitsen. Een korte staaf is
// voor die vergelijking geen bezwaar: het is een getallenvergelijking tussen
// twee modellen van dezelfde ligger, geen constructieve beoordeling.
//
// Voor de volledigheid meet [3b] dezelfde vergelijking op een ligger van 6 m
// en drukt de afwijking af; die hoort klein te zijn en van de opdeling te
// komen, niet van een sprong in de doorsnede.
//
// Draaien met: npx tsx test-verlopend-splitsen.mjs
//         of : node scripts/run-tests.mjs --filter=verlopend-splitsen

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { bepaalVerloop, doorsnedeOpPositie } = await import("./src/lib/sectionResolver.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { computeBeamSplitOpKnoop } = await import("./src/hooks/useFemStore.ts");
const {
  tussenProfielVoorSplitsing, gelasteIEigenschappen, gelasteIDoorsnede,
} = await import("./src/lib/verloopSplitsen.ts");
const { keurEindProfiel, doorsnedeNaam, isVerlopend, hoogteOpPositie } =
  await import("./src/lib/verloopKeuze.ts");
const { eigenDoorsnedenStore } = await import("./src/lib/profieleditor/eigenDoorsnedenStore.ts");
const { serializeProject, deserializeProject } = await import("./src/io/projectFile.ts");
const { defaultCombinations, combineResults } =
  await import("./src/components/fem/solver/combinations.ts");
const { selecteerCombinaties } = await import("./src/lib/combinatieSelectie.ts");
const { buildSteelCheckInputs, profileLookupKey } =
  await import("./src/lib/steelCheckBuilder.ts");
const { readFileSync } = await import("node:fs");
const { dirname, join, resolve } = await import("node:path");
const { fileURLToPath } = await import("node:url");


let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? "  (" + extra + ")" : ""}`); }
}
function rel(naam, gemeten, verwacht, tolRel) {
  const afw = Math.abs(gemeten - verwacht) / Math.max(Math.abs(verwacht), 1e-300);
  ok(naam, Number.isFinite(gemeten) && afw <= tolRel,
    `${gemeten.toPrecision(8)} vs ${verwacht.toPrecision(8)}, afwijking ${(afw * 100).toExponential(2)} %`);
  return afw;
}

const GEVAL_G = { id: 1, name: "G", type: "dead" };
const basisModel = (extra) => ({
  supports: [], plates: [], loadCases: [GEVAL_G], loads: [],
  selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  ...extra,
});

/** Uitkrager van lengte L met een puntlast P (kN) omlaag aan de tip. */
function uitkrager(L, beamVelden) {
  return basisModel({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, ...beamVelden }],
    supports: [{ nodeId: 1, type: "fixed" }],
    loads: [{ id: 1, type: "pointForce", caseId: 1, nodeId: 2, fz: -10 }],
  });
}

/** Dezelfde uitkrager, maar op fractie `t` gesplitst via de store-bewerking. */
function gesplitst(model, t) {
  const L = model.nodes[1].x;
  const nodes = [...model.nodes, { id: 3, x: t * L, z: 0 }];
  const deel = computeBeamSplitOpKnoop(
    { nodes, beams: model.beams, loads: model.loads }, 1, 3);
  if (!deel) throw new Error("splitsen mislukt");
  return { model: { ...model, nodes, beams: deel.beams, loads: deel.loads }, deel };
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] Splitsen zet het verloop op beide delen");
// ─────────────────────────────────────────────────────────────────────────
{
  const m = uitkrager(6000, { material: "C24", profile: "100x400", profileEnd: "100x200" });
  const { deel } = gesplitst(m, 0.5);
  const [d1, d2] = deel.beams;
  ok("deel 1 loopt van het beginprofiel naar de tussendoorsnede",
    d1.profile === "100x400" && d1.profileEnd === "100x300", `${d1.profile} → ${d1.profileEnd}`);
  ok("deel 2 loopt van de tussendoorsnede naar het eindprofiel",
    d2.profile === "100x300" && d2.profileEnd === "100x200", `${d2.profile} → ${d2.profileEnd}`);
  ok("beide delen zijn verlopend volgens bepaalVerloop",
    isVerlopend(d1) && isVerlopend(d2));

  // Een onronde splitsplaats levert een onronde maat — en die wordt NIET
  // afgerond, want dat zou de doorsnede verschuiven.
  const derde = gesplitst(uitkrager(6000, { material: "C24", profile: "100x400", profileEnd: "100x100" }), 1 / 3);
  const hMidden = Number(derde.deel.beams[0].profileEnd.split("x")[1].replace(",", "."));
  rel("splitsen op ⅓ van 400 → 100 geeft h = 300 zonder afronding", hMidden, 400 - 300 / 3, 1e-12);

  // Staal: de tussendoorsnede staat niet in de catalogus en wordt als eigen
  // gelaste doorsnede bewaard.
  const staal = gesplitst(uitkrager(6000, { material: "S235", profile: "IPE300", profileEnd: "IPE200" }), 0.5);
  const s1 = staal.deel.beams[0], s2 = staal.deel.beams[1];
  ok("staal: de tussendoorsnede is een EIGEN doorsnede", s1.profileEnd.startsWith("EIGEN:"), s1.profileEnd);
  ok("staal: beide delen dragen dezelfde tussendoorsnede", s1.profileEnd === s2.profile);
  const bewaard = eigenDoorsnedenStore.getState().items.find((d) => `EIGEN:${d.naam}` === s1.profileEnd);
  ok("staal: die doorsnede staat in de bibliotheek", !!bewaard);
  ok("staal: het is een samenstelling van drie platen (lijf + twee flenzen)",
    bewaard?.ontwerp.soort === "samenstelling" && bewaard.ontwerp.lamellen.length === 3);
  const vS = bepaalVerloop("S235", "IPE300", s1.profileEnd);
  ok("staal: deel 1 is verlopend met de eigen doorsnede als eind", vS.status === "verlopend");
  // IPE 300 h300 b150 tw7,1 tf10,7; IPE 200 h200 b100 tw5,6 tf8,5 → halverwege
  // h250 b125 tw6,35 tf9,6 (zie test-verlopend-profiel [2]).
  ok("staal: de maten halverwege zijn h250 b125 tw6,35 tf9,6",
    vS.status === "verlopend" && vS.verloop.eind.h === 250 && vS.verloop.eind.b === 125 &&
      Math.abs(vS.verloop.eind.tw - 6.35) < 1e-12 && Math.abs(vS.verloop.eind.tf - 9.6) < 1e-12);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] De doorsnedefunctie verandert op geen enkele plaats");
// ─────────────────────────────────────────────────────────────────────────
{
  for (const [naam, mat, p0, p1] of [
    ["hout 100x400 → 100x200", "C24", "100x400", "100x200"],
    ["hout 150x400 → 100x200 (b én h)", "C24", "150x400", "100x200"],
    ["staal IPE300 → IPE200", "S235", "IPE300", "IPE200"],
  ]) {
    for (const t of [0.25, 0.5, 1 / 3, 0.8]) {
      const heel = bepaalVerloop(mat, p0, p1);
      const tussen = tussenProfielVoorSplitsing(mat, p0, p1, t);
      if (tussen?.bewaren) eigenDoorsnedenStore.getState().bewaar(tussen.bewaren);
      const v1 = bepaalVerloop(mat, p0, tussen.tussenProfiel);
      const v2 = bepaalVerloop(mat, tussen.tussenProfiel, p1);
      let maxA = 0, maxI = 0;
      for (let i = 0; i <= 40; i++) {
        const s = i / 40;                       // globale positie op de hele staaf
        const heelD = doorsnedeOpPositie(heel.verloop, s);
        const deelD = s <= t
          ? doorsnedeOpPositie(v1.verloop, s / t)
          : doorsnedeOpPositie(v2.verloop, (s - t) / (1 - t));
        maxA = Math.max(maxA, Math.abs(deelD.A - heelD.A) / heelD.A);
        maxI = Math.max(maxI, Math.abs(deelD.I - heelD.I) / heelD.I);
      }
      ok(`${naam} op t=${t.toFixed(4)}: A en I gelijk op 41 plaatsen (rel. ≤ 1e-12)`,
        maxA < 1e-12 && maxI < 1e-12,
        `maxΔA ${maxA.toExponential(2)}, maxΔI ${maxI.toExponential(2)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Solver: gesplitst = ongesplitst, bij samenvallende stukgrenzen");
// ─────────────────────────────────────────────────────────────────────────
/**
 * Vergelijkt twee modellen station voor station. Het gesplitste model levert
 * twee elementen; hun stations worden achter elkaar gelegd met de splitsplaats
 * als verschuiving, zodat ze op dezelfde globale x liggen als die van het
 * hele model.
 */
function vergelijk(naam, heelModel, t, tol, metStations = true) {
  const heel = solveAllCases(bouwMultiInput(heelModel)).perCase.get(1);
  const { model: gm } = gesplitst(heelModel, t);
  const del = solveAllCases(bouwMultiInput(gm)).perCase.get(1);
  const L = heelModel.nodes[1].x;
  const e0 = heel.elements.get(1);
  const ids = gm.beams.map((b) => b.id);
  const eA = del.elements.get(ids[0]);
  const eB = del.elements.get(ids[1]);
  // De tip (knoop 2) is in beide modellen dezelfde knoop; zijn drie
  // vrijheidsgraden zijn dus rechtstreeks te vergelijken.
  const uH = heel.displacements.get(2);
  const uD = del.displacements.get(2);
  let dU = 0;
  for (const k of ["ux", "uz", "ry"]) {
    const schaal = Math.max(Math.abs(uH[k]), 1e-12);
    dU = Math.max(dU, Math.abs(uD[k] - uH[k]) / schaal);
  }
  ok(`${naam}: verplaatsing van de tip gelijk`, dU < tol, `max ${dU.toExponential(2)}`);
  const rH = heel.reactions.get(1), rD = del.reactions.get(1);
  rel(`${naam}: inklemmingsmoment gelijk`, rD.my, rH.my, tol);
  rel(`${naam}: verticale reactie gelijk`, rD.fz, rH.fz, tol);

  let dM = 0, dV = 0, dW = dU;
  if (metStations) {
    const x = [...eA.stations_mm, ...eB.stations_mm.map((v) => v + t * L)];
    const M = [...eA.bendingMoment, ...eB.bendingMoment];
    const V = [...eA.shearForce, ...eB.shearForce];
    const w = [...eA.deflection, ...eB.deflection];
    ok(`${naam}: evenveel rekenstations (${e0.stations_mm.length})`, x.length === e0.stations_mm.length,
      `${x.length} vs ${e0.stations_mm.length}`);
    const schaalM = Math.max(...e0.bendingMoment.map(Math.abs)) || 1;
    const schaalV = Math.max(...e0.shearForce.map(Math.abs)) || 1;
    const schaalW = Math.max(...e0.deflection.map(Math.abs)) || 1;
    let dx = 0;
    for (let i = 0; i < Math.min(x.length, e0.stations_mm.length); i++) {
      dx = Math.max(dx, Math.abs(x[i] - e0.stations_mm[i]));
      dM = Math.max(dM, Math.abs(M[i] - e0.bendingMoment[i]) / schaalM);
      dV = Math.max(dV, Math.abs(V[i] - e0.shearForce[i]) / schaalV);
      dW = Math.max(dW, Math.abs(w[i] - e0.deflection[i]) / schaalW);
    }
    ok(`${naam}: de stations liggen op dezelfde plaats`, dx < 1e-6, `max Δx ${dx.toExponential(2)} mm`);
    ok(`${naam}: momentenlijn gelijk op alle ${x.length} stations`, dM < tol, `max ${dM.toExponential(2)}`);
    ok(`${naam}: dwarskrachtenlijn gelijk`, dV < tol, `max ${dV.toExponential(2)}`);
    ok(`${naam}: zakking gelijk`, dW < tol, `max ${dW.toExponential(2)}`);
  }
  return { dM, dV, dW, dU };
}
{
  // L = 460 mm, gesplitst op de helft. Het geheel krijgt ⌊460/25⌋ = 18 stukken
  // van 25,56 mm; elke helft (230 mm) krijgt er ⌊230/25⌋ = 9 van diezelfde
  // 25,56 mm. De stukgrenzen — en dus alle 378 rekenstations — vallen exact
  // samen. Wat er dan nog verschilt, kan alleen van het splitsen zelf komen.
  vergelijk("hout 50x100 → 50x60, L = 460, t = ½",
    uitkrager(460, { material: "C24", profile: "50x100", profileEnd: "50x60" }), 0.5, 1e-9);
  vergelijk("staal IPE100 → IPE80, L = 460, t = ½",
    uitkrager(460, { material: "S235", profile: "IPE100", profileEnd: "IPE80" }), 0.5, 1e-9);
}

log("\n[3b] Dezelfde vergelijking op 6 m — het restverschil komt van de opdeling");
{
  // Hier krijgt het geheel 20 stukken van 300 mm en krijgen de delen 20 van
  // 150 mm elk: een FIJNERE trap op dezelfde I(x), dus niet meer dezelfde
  // benadering. De stations vallen daarom niet samen en er wordt op de knopen
  // vergeleken; het verschil is de benaderingsfout van de opdeling, die
  // test-verlopend-profiel [6] apart meet.
  const r = vergelijk("hout 100x400 → 100x200, L = 6000, t = ½",
    uitkrager(6000, { material: "C24", profile: "100x400", profileEnd: "100x200" }), 0.5, 5e-3, false);
  ok("het restverschil in de tipzakking is < 0,2 % (opdelingsfout, geen sprong in de doorsnede)",
    r.dU < 2e-3, `${(r.dU * 100).toExponential(2)} %`);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Een prismatische staaf verandert niet");
// ─────────────────────────────────────────────────────────────────────────
{
  const voor = eigenDoorsnedenStore.getState().items.length;
  const m = uitkrager(6000, { material: "S235", profile: "IPE300" });
  const { deel } = gesplitst(m, 0.37);
  ok("geen eindprofiel bijgezet", deel.beams.every((b) => b.profileEnd === undefined));
  ok("beide delen houden het profiel", deel.beams.every((b) => b.profile === "IPE300"));
  ok("geen eigen doorsnede bewaard", eigenDoorsnedenStore.getState().items.length === voor);
  vergelijk("prismatisch IPE300, L = 6000, t = 0,37", m, 0.37, 1e-9, false);

  // Ook een staaf waarvan het eindprofiel gelijk is aan het begin (in een
  // andere schrijfwijze) blijft prismatisch.
  const gelijk = gesplitst(uitkrager(6000, { material: "S235", profile: "IPE300", profileEnd: "IPE 300" }), 0.5);
  ok("eindprofiel gelijk aan begin: geen tussendoorsnede",
    gelijk.deel.beams.every((b) => b.profileEnd === "IPE 300"));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] De keuring in de interface geeft de reden van bepaalVerloop");
// ─────────────────────────────────────────────────────────────────────────
{
  const gevallen = [
    ["hout: rechthoek → I-profiel", "C24", "100x300", "IPE200"],
    ["staal: I-profiel → rechthoek", "S235", "IPE300", "100x200"],
    ["staal: I → koker", "S235", "IPE300", "HFRHS200X200X16"],
    ["staal: I → buis", "S235", "IPE300", "CHS424X32"],
    ["staal: I → I met toelopende flenzen", "S235", "IPE300", "INP300"],
    ["staal: onbekend eindprofiel", "S235", "IPE300", "IPE999"],
    ["beton", "C30/37", "300x500", "300x400"],
    ["kruislaaghout", "C24", "CLT 5s 100", "CLT 3s 60"],
    ["eigen doorsnede die geen gelaste I is", "S235", "IPE300", "EIGEN:niet bestaand"],
  ];
  for (const [naam, mat, p0, p1] of gevallen) {
    const keuring = keurEindProfiel(mat, p0, p1);
    const kern = bepaalVerloop(mat, p0, p1);
    ok(`${naam}: geweigerd`, keuring.status === "fout",
      keuring.status === "fout" ? keuring.reden.slice(0, 90) : keuring.status);
    ok(`${naam}: letterlijk de reden van bepaalVerloop, geen tweede tekst`,
      keuring.status === "fout" && kern.status === "fout" && keuring.reden === kern.reden);
    ok(`${naam}: de naam verzwijgt het ongeldige eind niet`,
      doorsnedeNaam({ material: mat, profile: p0, profileEnd: p1 }).includes("ongeldig verloop"));
  }
  ok("goedgekeurd verloop heeft geen reden",
    keurEindProfiel("S235", "IPE300", "IPE200").status === "verlopend");
  ok("leeg eindprofiel is prismatisch",
    keurEindProfiel("S235", "IPE300", "").status === "prismatisch");
  ok('naam van een verlopende staaf: "IPE300 → IPE200 (verlopend)"',
    doorsnedeNaam({ material: "S235", profile: "IPE300", profileEnd: "IPE200" }) === "IPE300 → IPE200 (verlopend)");
  ok("naam van een prismatische staaf is de profielnaam zelf",
    doorsnedeNaam({ material: "S235", profile: "IPE300" }) === "IPE300");
  rel("hoogte halverwege een verloop 400 → 200",
    hoogteOpPositie({ material: "C24", profile: "100x400", profileEnd: "100x200" }, 0.5), 300, 1e-12);
  ok("hoogte van een prismatische staaf is null",
    hoogteOpPositie({ material: "C24", profile: "100x400" }, 0.5) === null);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Het projectbestand bewaart begin én eind");
// ─────────────────────────────────────────────────────────────────────────
{
  const m = uitkrager(6000, { material: "C24", profile: "100x400", profileEnd: "100x200" });
  const { model: gm } = gesplitst(uitkrager(6000, { material: "S235", profile: "IPE300", profileEnd: "IPE200" }), 0.5);
  const project = {
    ...m,
    beams: [...m.beams, ...gm.beams.map((b, i) => ({ ...b, id: 10 + i }))],
    nodes: [...m.nodes, { id: 4, x: 3000, z: 0 }],
  };
  const tekst = serializeProject(project);
  const terug = deserializeProject(tekst);
  for (const b of project.beams) {
    const na = terug.beams.find((x) => x.id === b.id);
    ok(`staaf ${b.id}: profiel en eindprofiel overleven opslaan en openen`,
      na?.profile === b.profile && (na?.profileEnd ?? undefined) === (b.profileEnd ?? undefined),
      `${na?.profile} → ${na?.profileEnd}`);
  }
  ok("de eigen gelaste doorsnede reist mee in het bestand",
    tekst.includes("Gelast I"), tekst.length + " tekens");
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] De grootheden van de gelaste tussendoorsnede tegen de hand");
// ─────────────────────────────────────────────────────────────────────────
{
  // h = 250, b = 125, t_w = 6,35, t_f = 9,6 (IPE 300 → IPE 200 halverwege).
  const m = { h: 250, b: 125, tw: 6.35, tf: 9.6 };
  const e = gelasteIEigenschappen(m);
  const hw = 250 - 2 * 9.6;                     // 230,8
  rel("A = 2·b·t_f + h_w·t_w", e.area_mm2, 2 * 125 * 9.6 + hw * 6.35, 1e-12);
  rel("I_y = [b·h³ − (b−t_w)·h_w³]/12", e.iy_mm4, (125 * 250 ** 3 - (125 - 6.35) * hw ** 3) / 12, 1e-12);
  rel("I_z = [2·t_f·b³ + h_w·t_w³]/12", e.iz_mm4, (2 * 9.6 * 125 ** 3 + hw * 6.35 ** 3) / 12, 1e-12);
  rel("W_pl,y = b·t_f·(h−t_f) + t_w·h_w²/4", e.wpl_y_mm3, 125 * 9.6 * (250 - 9.6) + 6.35 * hw ** 2 / 4, 1e-12);
  rel("I_t = ⅓·(2·b·t_f³ + h_w·t_w³)", e.it_mm4, (2 * 125 * 9.6 ** 3 + hw * 6.35 ** 3) / 3, 1e-12);
  rel("I_w = I_z·(h−t_f)²/4", e.iw_mm6, e.iz_mm4 * (250 - 9.6) ** 2 / 4, 1e-12);
  rel("A_v,z = h_w·t_w (6.2.6(3)b, η = 1,0)", e.av_z_mm2, hw * 6.35, 1e-12);
  ok("dubbelsymmetrisch: I_yz = 0 en het schuifmiddelpunt valt op het zwaartepunt",
    e.iyz_mm4 === 0 && e.y_s_mm === e.y_c_mm && e.z_s_mm === e.z_c_mm);
  ok("geen walsuitronding (gelaste plaatconstructie)", e.r_mm === 0);
  // De A en I_y die de solver voor het verloop gebruikt, komen uit dezelfde
  // formules: de eigen doorsnede en het verloop kunnen niet uit elkaar lopen.
  const v = bepaalVerloop("S235", "IPE300", "IPE200");
  const d = doorsnedeOpPositie(v.verloop, 0.5);
  rel("dezelfde A als doorsnedeOpPositie van het verloop", e.area_mm2, d.A, 1e-12);
  rel("dezelfde I_y als doorsnedeOpPositie van het verloop", e.iy_mm4, d.I, 1e-12);
  ok("de bewaarde doorsnede draagt de vormaanduiding voor de toetsing",
    gelasteIDoorsnede(m).vorm === "GelasteIDubbelsymmetrisch");
}

// ───────────────────────────────────────────────────────────────────────
log("\n[8] Na het splitsen is een stalen staaf nog steeds te TOETSEN");
// ───────────────────────────────────────────────────────────────────────
//
// De tussendoorsnede staat in geen catalogus. Zou de toetsbouwer haar niet
// kunnen doorgeven, dan zou splitsen een staaf opleveren die de rekenkern
// weigert — het splitsen zou de toetsing dan stilletjes stukmaken. Deze proef
// eist dat beide delen in `inputs` staan (niet in `skipped`) en dat de
// doorsnede werkelijk MEEREIST, als geometrie van drie platen.
{
  const HIER = dirname(fileURLToPath(import.meta.url));
  const REPO = resolve(HIER, "..");
  const PROFIELEN = JSON.parse(readFileSync(
    join(REPO, "src-tauri", "crates", "steel-profiles", "data", "profiles.json"), "utf8"));
  const profileDb = new Map();
  for (const pr of PROFIELEN) {
    const k = profileLookupKey(pr.name);
    if (!profileDb.has(k)) profileDb.set(k, pr);
  }
  // Ligger op twee steunpunten, IPE 300 → IPE 200, gesplitst op de helft.
  const heel = basisModel({
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, material: "S235", profile: "IPE300", profileEnd: "IPE200" }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads: [{ id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -8 }],
  });
  const { model: gm } = gesplitst(heel, 0.5);
  const { perCase } = solveAllCases(bouwMultiInput(gm));
  const combinations =
    selecteerCombinaties(defaultCombinations(gm.loadCases), gm.beams, gm.plates).actief;
  const combinationResults = new Map(combinations.map((c) => [c.id, combineResults(c, perCase)]));
  const uit = buildSteelCheckInputs({
    nodes: gm.nodes, beams: gm.beams, supports: gm.supports, combinations, combinationResults,
    profileDb, loadCases: gm.loadCases, gevallenMetLast: [...perCase.keys()],
  });
  ok("beide delen komen in de toetsinvoer, geen enkele overgeslagen",
    uit.inputs.length === 2 && uit.skipped.length === 0,
    `${uit.inputs.length} invoeren, ${uit.skipped.length} overgeslagen: ` +
      uit.skipped.map((x) => x.reason).join("; ").slice(0, 120));
  const [i1, i2] = uit.inputs;
  ok("deel 1: beginprofiel IPE 300, eindprofiel de eigen doorsnede",
    i1?.profile_name === "IPE300" && String(i1?.profile_end).startsWith("EIGEN:"),
    `${i1?.profile_name} → ${i1?.profile_end}`);
  ok("deel 1: de tussendoorsnede reist mee als drie platen",
    i1?.custom_section_end?.lamellen?.length === 3);
  ok("deel 2: begint met de eigen doorsnede en eindigt op IPE 200",
    i2?.custom_section?.lamellen?.length === 3 && i2?.profile_end === "IPE200",
    `${i2?.profile_name} → ${i2?.profile_end}`);
  // De maten in die platen zijn die van IPE 300 → IPE 200 halverwege:
  // h 250, b 125, t_w 6,35, t_f 9,6 (zie test-verlopend-profiel [2]).
  const lam = i1?.custom_section_end?.lamellen ?? [];
  const lijf = lam.find((l) => Math.abs(Math.abs(l.alpha_rad) - Math.PI / 2) < 1e-9);
  const flens = lam.find((l) => Math.abs(l.alpha_rad) < 1e-9);
  rel("de hoogte van de tussendoorsnede is 250 mm", (lijf?.b_mm ?? 0) + 2 * (flens?.t_mm ?? 0), 250, 1e-12);
  rel("de breedte is 125 mm", flens?.b_mm ?? 0, 125, 1e-12);
  rel("de lijfdikte is 6,35 mm", lijf?.t_mm ?? 0, 6.35, 1e-12);
  rel("de flensdikte is 9,6 mm", flens?.t_mm ?? 0, 9.6, 1e-12);
}

log("");
log(`${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
