// Sneden op de juiste plaats — knikken en sprongen krijgen een eigen station.
//
// WAAROM DEZE TEST BESTAAT
// De krachtenlijn wordt uitgelezen op de stations die elk rekenelement
// oplevert: een vast aantal (21), gelijkmatig verdeeld. Alles wat tússen twee
// stations gebeurt, wordt weggeïnterpoleerd. Op twee plaatsen is dat
// aantoonbaar fout:
//   • op een DEELLASTGRENS knikt V(x) — de helling springt van 0 naar −q;
//   • op een ZONEGRENS van de wapening springt de opneembare weerstand, en een
//     dekkingslijn moet daar links en rechts een eigen waarde tonen.
// De adapter zet daar nu een echte rekenknoop, met hetzelfde mechanisme
// waarmee hij al knipt voor plaatranden, staafpuntlasten en segmentgrenzen.
// Op zo'n snede staat het station DUBBEL: het stuk links eindigt erop en het
// stuk rechts begint erop.
//
// WAT HIER BEWEZEN WORDT
//   [1] Zonder iets te knippen verandert er niets — bit-voor-bit.
//   [2] De deellastgrenzen worden stations, met de handberekende waarden, en
//       de oude interpolatie zat er meetbaar naast.
//   [3] `extraSneden` doet hetzelfde voor knikken die de solver niet ziet
//       (de zonegrenzen), en verandert reacties noch verplaatsingen.
//   [4] De samenvoegregel: geen flinterelementen, ook niet bij twee sneden op
//       3 mm van elkaar.
//   [5] Een snede last nooit een bestaande knoop aan de staaf vast.
//   [6] Modellen met platen blijven volledig ongemoeid.
//   [7] Het stationsraster is lastgeval-onafhankelijk, zodat superpositie en
//       omhullende geldig blijven.
//
// EXACTHEID. Voor een Euler-Bernoulli-staaf met consistente knooplasten is de
// eindige-elementenoplossing in de KNOPEN exact (de homogene oplossing is
// kubisch en ligt in de Hermite-ruimte). Een extra knoop midden op een staaf
// verandert reacties en verplaatsingen dus niet; hij maakt alleen het raster
// fijner. Alle toetsen hieronder rekenen daarom met 1e-9 relatief, niet met
// procenten.
//
// Draaien met: npx tsx test-sneden.mjs   (vanuit design-mockup/)

const { solve, solveAllCases } = await import("./src/components/fem/solver/engine.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

/** Relatieve toets; drukt de gemeten afwijking altijd af. */
function check(naam, gemeten, verwacht, tolRel = 1e-9) {
  const schaal = Math.abs(verwacht) > 1e-12 ? Math.abs(verwacht) : 1;
  const rel = Math.abs(gemeten - verwacht) / schaal;
  if (rel <= tolRel) {
    passed++;
    log(`  ✓ ${naam}: ${gemeten.toPrecision(10)} (afw ${rel.toExponential(2)})`);
  } else {
    failed++;
    log(`  ✗ ${naam}: ${gemeten.toPrecision(10)} vs ${verwacht.toPrecision(10)} (afw ${rel.toExponential(2)})`);
  }
}

function checkWaar(naam, voorwaarde, toelichting = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${toelichting ? ` — ${toelichting}` : ""}`); }
  else { failed++; log(`  ✗ ${naam}${toelichting ? ` — ${toelichting}` : ""}`); }
}

// ── Gereedschap ────────────────────────────────────────────────────────────
const E0 = 210000, A0 = 3877, I0 = 1.673e7;   // HEA 160 / S235
const L = 6000;                                // mm

/** Index van het EERSTE station op positie x (mm); −1 als het er niet is. */
function bijX(el, x, tol = 1e-6) {
  for (let i = 0; i < el.stations_mm.length; i++) {
    if (Math.abs(el.stations_mm[i] - x) <= tol) return i;
  }
  return -1;
}

/** Aantal stations op positie x — 2 op een snede, 1 daarbuiten. */
function aantalBijX(el, x, tol = 1e-6) {
  return el.stations_mm.filter((u) => Math.abs(u - x) <= tol).length;
}

/** Lengte van elk rekenelement uit de stationsreeks (21 stations per stuk). */
function elementLengtes(el) {
  const uit = [];
  for (let i = 0; i + 20 < el.stations_mm.length; i += 21) {
    uit.push(el.stations_mm[i + 20] - el.stations_mm[i]);
  }
  return uit;
}

/** Vrij opgelegde ligger met de opgegeven lasten en (optioneel) sneden. */
function ligger({ loads = [], beamPointLoads = [], extraSneden, cases }) {
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 }],
    beams: [{ id: 1, from: 1, to: 2, E: E0, A: A0, I: I0, ...(extraSneden ? { extraSneden } : {}) }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }],
    loads, beamPointLoads,
    ...(cases ? { cases } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[1] Niets te knippen ⇒ niets veranderd (regressie-anker)");
// ═══════════════════════════════════════════════════════════════════════════
// Een last over de VOLLE lengte heeft geen grens in het veld, dus er valt niets
// te knippen. Dat pad moet bit-voor-bit blijven wat het was: één rekenelement,
// 21 stations. Hetzelfde geldt voor een deellast waarvan de waarde nul is.
{
  const vol = solve(ligger({ loads: [{ beamId: 1, q: -10 }] })).elements.get(1);
  checkWaar("volle-lengte q: één rekenelement, 21 stations",
    vol.stations_mm.length === 21, `${vol.stations_mm.length} stations`);
  check("M(½L) = qL²/8", vol.bendingMoment[10], 10 * L * L / 8);

  // startFrac 0 / endFrac 1 expliciet: nog steeds de volle lengte.
  const expliciet = solve(ligger({
    loads: [{ beamId: 1, q: -10, startFrac: 0, endFrac: 1 }],
  })).elements.get(1);
  let bitgelijk = vol.stations_mm.length === expliciet.stations_mm.length;
  for (const veld of ["stations_mm", "bendingMoment", "shearForce", "deflection"]) {
    for (let i = 0; i < vol[veld].length && bitgelijk; i++) {
      if (!Object.is(vol[veld][i], expliciet[veld][i])) bitgelijk = false;
    }
  }
  checkWaar("expliciet [0, 1] is bitgelijk aan de volle lengte", bitgelijk);

  // Een deellast met q = 0 is geen last en levert dus ook geen knik.
  const nul = solve(ligger({
    loads: [{ beamId: 1, q: -10 }, { beamId: 1, q: 0, startFrac: 0.3, endFrac: 0.6 }],
  })).elements.get(1);
  checkWaar("deellast met q = 0 levert geen snede",
    nul.stations_mm.length === 21, `${nul.stations_mm.length} stations`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] Deellastgrenzen worden stations — en de oude interpolatie zat ernaast");
// ═══════════════════════════════════════════════════════════════════════════
// HANDBEREKENING. Vrij opgelegde ligger L = 6000 mm, q = 10 N/mm omlaag op
// [2500, 3500] mm. Resultante W = 10·1000 = 10 000 N, symmetrisch om ½L, dus
//   R_A = R_B = 5000 N.
// Dwarskracht (V positief = R_A-zijde):
//   V(x) = 5000                       voor x ≤ 2500
//   V(x) = 5000 − 10·(x − 2500)       op het belaste deel
//   V(3500) = 5000 − 10 000 = −5000
// De knik zit op x = 2500 en x = 3500.
//
// WAT ER MIS WAS. Zonder snede loopt het raster met stap L/20 = 300 mm:
// …, 2400, 2700, … Op 2500 stond dus geen station. Wie V(2500) uit de buren
// haalt, interpoleert lineair tussen V(2400) = 5000 en V(2700) = 5000 − 10·200
// = 3000 en vindt 5000 + (3000 − 5000)·(100/300) = 4333,33 N — 13,3 % onder de
// werkelijke 5000 N. Precies zo mist de omhullende de knik. Die twee getallen
// worden hieronder allebei uitgerekend en tegen elkaar gezet.
{
  const el = solve(ligger({
    loads: [{ beamId: 1, q: -10, startFrac: 2500 / L, endFrac: 3500 / L }],
  })).elements.get(1);

  checkWaar("drie rekenstukken (2 sneden)", elementLengtes(el).length === 3,
    `lengtes ${elementLengtes(el).map((v) => v.toFixed(0)).join(" / ")} mm`);
  checkWaar("station op x = 2500 staat dubbel", aantalBijX(el, 2500) === 2);
  checkWaar("station op x = 3500 staat dubbel", aantalBijX(el, 3500) === 2);

  const i2500 = bijX(el, 2500), i3500 = bijX(el, 3500);
  check("V(2500) = +5000 N (einde onbelast deel)", el.shearForce[i2500], 5000);
  check("V(2500) = +5000 N ook rechts van de snede", el.shearForce[i2500 + 1], 5000);
  check("V(3500) = −5000 N (einde belast deel)", el.shearForce[i3500], -5000);
  check("V(3500) = −5000 N ook rechts van de snede", el.shearForce[i3500 + 1], -5000);
  // M(2500) = R_A·2500 = 12,5e6 N·mm; M(3500) = R_B·2500 = 12,5e6 (symmetrie).
  check("M(2500) = R_A·2500", el.bendingMoment[i2500], 5000 * 2500);
  check("M(3500) = R_B·2500", el.bendingMoment[i3500], 5000 * 2500);
  // M(½L) = R_A·3000 − q·500²/2 = 15e6 − 1,25e6 = 13,75e6 N·mm.
  check("M(½L) = 13,75e6 N·mm", el.bendingMoment[bijX(el, 3000)],
    5000 * 3000 - 10 * 500 * 500 / 2);

  // De oude interpolatie nagerekend, met waarden die het model zelf levert.
  // V is constant 5000 N op heel [0, 2500], dus V(2400) = V(2375) = 5000 N;
  // het station op 2700 bestaat ook in het nieuwe raster (2500 + 4·50) en
  // levert 5000 − 10·200 = 3000 N.
  const vOud2400 = el.shearForce[bijX(el, 2375)];
  const v2700exact = el.shearForce[bijX(el, 2700)];
  check("V is vlak vóór de lastgrens nog 5000 N (x = 2375)", vOud2400, 5000);
  check("V(2700) = 5000 − 10·200 = 3000 N", v2700exact, 3000);
  const geinterpoleerd = vOud2400 + (v2700exact - vOud2400) * (100 / 300);
  check("het oude raster gaf op 2500 mm 4333,33 N", geinterpoleerd, 4333.3333333333, 1e-9);
  checkWaar("de snede haalt daar 13,3 % fout weg",
    Math.abs(geinterpoleerd - 5000) / 5000 > 0.13,
    `interpolatie ${geinterpoleerd.toFixed(2)} N tegen exact 5000 N`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] extraSneden: een station waar de aanroeper er een vraagt");
// ═══════════════════════════════════════════════════════════════════════════
// Dit is de aansluiting waarlangs de wapeningszones straks hun grenzen
// doorgeven. De zones zelf wonen buiten de solver; de solver hoeft alleen te
// weten wáár hij moet knippen. Bewijs: het raster wordt fijner én reacties en
// verplaatsingen blijven gelijk, want de oplossing in de knopen is exact.
{
  const zonder = solve(ligger({ loads: [{ beamId: 1, q: -10 }] }));
  const met = solve(ligger({
    loads: [{ beamId: 1, q: -10 }],
    extraSneden: [1500 / L, 4500 / L],       // twee "zonegrenzen"
  }));
  const elZ = zonder.elements.get(1), elM = met.elements.get(1);

  checkWaar("zonder sneden: 21 stations", elZ.stations_mm.length === 21);
  checkWaar("met twee sneden: 63 stations", elM.stations_mm.length === 63,
    `${elM.stations_mm.length}`);
  checkWaar("station op 1500 staat dubbel", aantalBijX(elM, 1500) === 2);
  checkWaar("station op 4500 staat dubbel", aantalBijX(elM, 4500) === 2);

  // De uitkomst zelf mag niet bewegen.
  for (const nid of [1, 2]) {
    check(`R_z knoop ${nid} onveranderd`, met.reactions.get(nid).fz, zonder.reactions.get(nid).fz);
  }
  check("w(½L) onveranderd",
    elM.deflection[bijX(elM, 3000)], elZ.deflection[bijX(elZ, 3000)]);
  // M(1500) = q·x·(L−x)/2 = 10·1500·4500/2 = 33,75e6 N·mm (handberekening).
  check("M(1500) = q·x·(L−x)/2", elM.bendingMoment[bijX(elM, 1500)],
    10 * 1500 * (L - 1500) / 2);
  // Elk station dat het grove raster had, heeft het fijne raster ook — 1500 en
  // 4500 zijn veelvouden van 300, dus hier is het fijne raster wél een
  // verfijning van het grove. Dat maakt een station-voor-station-vergelijking
  // mogelijk.
  let ergste = 0;
  const schaal = Math.max(...elZ.bendingMoment.map(Math.abs));
  for (let i = 0; i < elZ.stations_mm.length; i++) {
    const j = bijX(elM, elZ.stations_mm[i]);
    if (j < 0) { failed++; log(`  ✗ station ${elZ.stations_mm[i]} ontbreekt`); continue; }
    ergste = Math.max(ergste, Math.abs(elM.bendingMoment[j] - elZ.bendingMoment[i]) / schaal);
  }
  checkWaar("momentenlijn op alle oude stations gelijk", ergste <= 1e-9,
    `grootste afwijking ${ergste.toExponential(2)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[4] Samenvoegregel — geen flinterelementen");
// ═══════════════════════════════════════════════════════════════════════════
// Een rekenelement korter dan MIN_SEGMENT_MM (25 mm) is numeriek slecht
// geconditioneerd; de meting achter die grens staat in engine.ts. Een extra
// snede draagt alleen een station en verliest dus altijd van wat er al ligt:
// van een uiteinde, van een dwingende splitsfractie én van een al aanvaarde
// extra snede. Dat laatste is strenger dan de regel voor segmentgrenzen, en
// dat mag: het weglaten van een extra snede kost hooguit een tekenpunt.
{
  // 4a — twee sneden op 3 mm van elkaar: de linker wint, de rechter vervalt.
  const el3mm = solve(ligger({
    loads: [{ beamId: 1, q: -10 }],
    extraSneden: [3000 / L, 3003 / L],
  })).elements.get(1);
  const lengtes3mm = elementLengtes(el3mm);
  checkWaar("twee sneden op 3 mm: twee rekenstukken, niet drie",
    lengtes3mm.length === 2, `lengtes ${lengtes3mm.map((v) => v.toFixed(1)).join(" / ")} mm`);
  checkWaar("de linker snede (3000 mm) is die welke overblijft",
    aantalBijX(el3mm, 3000) === 2 && aantalBijX(el3mm, 3003) === 0);
  checkWaar("kortste rekenstuk ≥ 25 mm", Math.min(...lengtes3mm) >= 25 - 1e-9,
    `${Math.min(...lengtes3mm).toFixed(1)} mm`);

  // 4b — precies op de drempel: 25 mm uit elkaar is nog te dicht (< is de
  // toets, dus 25,0 mm zelf haalt het net wel), 24 mm valt weg.
  const el24 = solve(ligger({
    loads: [{ beamId: 1, q: -10 }], extraSneden: [3000 / L, 3024 / L],
  })).elements.get(1);
  checkWaar("24 mm uit elkaar: de tweede vervalt", elementLengtes(el24).length === 2);
  const el26 = solve(ligger({
    loads: [{ beamId: 1, q: -10 }], extraSneden: [3000 / L, 3026 / L],
  })).elements.get(1);
  checkWaar("26 mm uit elkaar: allebei blijven", elementLengtes(el26).length === 3,
    `lengtes ${elementLengtes(el26).map((v) => v.toFixed(1)).join(" / ")} mm`);

  // 4c — vlak naast een uiteinde: daar zit al een knoop.
  const elRand = solve(ligger({
    loads: [{ beamId: 1, q: -10 }], extraSneden: [10 / L, 1 - 10 / L],
  })).elements.get(1);
  checkWaar("snede 10 mm van een uiteinde vervalt",
    elRand.stations_mm.length === 21, `${elRand.stations_mm.length} stations`);

  // 4d — vlak naast een DWINGENDE fractie (een staafpuntlast). De puntlast
  // wint altijd: daar grijpt werkelijk een kracht aan.
  const elLast = solve(ligger({
    loads: [{ beamId: 1, q: -10 }],
    beamPointLoads: [{ beamId: 1, posFrac: 2000 / L, fz: -5000 }],
    extraSneden: [2005 / L],
  })).elements.get(1);
  checkWaar("snede 5 mm naast een puntlast vervalt",
    elementLengtes(elLast).length === 2 && aantalBijX(elLast, 2000) === 2,
    `lengtes ${elementLengtes(elLast).map((v) => v.toFixed(1)).join(" / ")} mm`);

  // 4e — een deellast die exact tot de puntlastpositie loopt: één snede, geen
  // dubbele. (De deellastgrens valt samen met de dwingende fractie.)
  const elSamen = solve(ligger({
    loads: [{ beamId: 1, q: -10, startFrac: 0, endFrac: 2000 / L }],
    beamPointLoads: [{ beamId: 1, posFrac: 2000 / L, fz: -5000 }],
  })).elements.get(1);
  checkWaar("samenvallende lastgrens en puntlast: twee stukken",
    elementLengtes(elSamen).length === 2,
    `lengtes ${elementLengtes(elSamen).map((v) => v.toFixed(1)).join(" / ")} mm`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[5] Een snede last nooit een bestaande knoop aan de staaf vast");
// ═══════════════════════════════════════════════════════════════════════════
// De splitslus hergebruikt een knoop die al binnen 1 mm ligt — bedoeld voor
// plaatrandknopen, die er juist aan móéten. Voor een extra snede zou dat een
// modelwijziging zijn: een kolomvoet die alleen tégen een ligger aan staat,
// zou er ineens aan vastzitten en het mechanisme zou verdwijnen dat de
// gebruiker nog moet zien. Zo'n snede vervalt daarom.
//
// Model: doorgaande ligger van 0 tot 6000 op twee steunpunten, met een LOSSE
// knoop 3 op x = 2500 die nergens aan vastzit (hij hangt aan een tweede,
// verticale staaf die verder niets doet). De deellast eindigt precies op 2500.
// Zonder de regel zou de ligger daar aan knoop 3 worden geknoopt en zou de
// verticale staaf ineens meedragen.
{
  const metLosseKnoop = {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: L, z: 0 },
      { id: 3, x: 2500, z: 0 }, { id: 4, x: 2500, z: -2000 },
    ],
    beams: [
      { id: 1, from: 1, to: 2, E: E0, A: A0, I: I0 },
      { id: 2, from: 4, to: 3, E: E0, A: A0, I: I0 },
    ],
    supports: [
      { nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" },
      { nodeId: 4, type: "fixed" },
    ],
    loads: [{ beamId: 1, q: -10, startFrac: 0, endFrac: 2500 / L }],
  };
  const r = solve(metLosseKnoop);
  const el = r.elements.get(1);
  checkWaar("de ligger blijft ongesplitst — de snede op 2500 vervalt",
    el.stations_mm.length === 21, `${el.stations_mm.length} stations`);
  // Handberekening met de losse kolom (die dus niets draagt):
  // W = 10·2500 = 25 000 N op x = 1250 → R_B = 25 000·1250/6000 = 5208,333 N,
  // R_A = 25 000 − 5208,333 = 19 791,667 N.
  check("R_A = 19 791,667 N (de kolom draagt niet mee)",
    r.reactions.get(1).fz, 25000 - 25000 * 1250 / L, 1e-9);
  check("R_B = 5208,333 N", r.reactions.get(2).fz, 25000 * 1250 / L, 1e-9);
  check("de losse kolom draagt geen verticale reactie",
    Math.abs(r.reactions.get(4)?.fz ?? 0), 0, 1e-9);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[6] Modellen met platen blijven volledig ongemoeid");
// ═══════════════════════════════════════════════════════════════════════════
// Staaf- en plaatknopen worden binnen 1 mm aan elkaar geknoopt. Een extra
// snede zou daar ongevraagd een verbinding kunnen leggen, of juist een losse
// knoop tussen twee plaatknopen achterlaten die niet meedraagt. Zolang dat
// niet per staaf wordt getoetst, zet de adapter in een model MET platen géén
// extra sneden — ook niet uit `extraSneden`.
{
  const B = 3000, H = 3000, S = 500, T = 20;
  const nodes = [];
  for (let i = 0; i <= 6; i++) nodes.push({ id: 1 + i, x: i * S, z: 0 });   // onderrand
  for (let i = 0; i <= 6; i++) nodes.push({ id: 8 + i, x: i * S, z: H });   // bovenrand
  const invoer = {
    nodes,
    // Randstaaf over de bovenrand, met een deellast en een expliciete snede:
    // allebei zouden ze buiten een plaatmodel een snede opleveren.
    beams: [{ id: 1, from: 8, to: 14, E: E0, A: A0, I: I0, extraSneden: [0.37] }],
    supports: nodes.slice(0, 7).map((n) =>
      n.id === 4 ? { nodeId: n.id, type: "pinned" } : { nodeId: n.id, type: "zRoller" }),
    loads: [{ beamId: 1, q: -10, startFrac: 0.23, endFrac: 0.71, caseId: 1 }],
    plates: [{ id: 1, nodeIds: [1, 7, 14, 8], thickness: T, E: E0, nu: 0.3, rho: 7850, meshSize: S }],
    cases: [{ id: 1, name: "G" }],
  };
  const r = solveAllCases(invoer).perCase.get(1);
  const el = r.elements.get(1);
  // De randstaaf wordt uitsluitend op de PLAATRANDKNOPEN gesplitst: 6 vakken
  // van 500 mm over 3000 mm, dus 6 stukken × 21 = 126 stations. De sneden op
  // 0,23·B = 690 mm en 0,37·B = 1110 mm zijn er niet bij.
  checkWaar("randstaaf alleen op de plaatrandknopen gesplitst",
    el.stations_mm.length === 126, `${el.stations_mm.length} stations`);
  for (const x of [690, 1110, 2130]) {
    checkWaar(`geen station op ${x} mm (${x === 1110 ? "extraSneden" : "deellastgrens"})`,
      bijX(el, x) < 0);
  }
  for (let i = 1; i <= 5; i++) {
    checkWaar(`plaatrandknoop op ${i * S} mm is wél een snede`, aantalBijX(el, i * S) === 2);
  }
  checkWaar("plaatresultaten aanwezig (36 elementen)",
    Array.isArray(r.plateElements) && r.plateElements.length === 1
    && r.plateElements[0].elements.length === 36,
    `${r.plateElements?.[0]?.elements?.length}`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[7] Het raster is lastgeval-onafhankelijk — superpositie blijft gelden");
// ═══════════════════════════════════════════════════════════════════════════
// De sneden worden bepaald uit ÁLLE lasten in de invoer, ongeacht hun factor
// in deze solve. Zou dat niet zo zijn, dan kreeg elk belastinggeval een eigen
// raster en zou het optellen van per-geval-resultaten (combinaties,
// omhullende) stations vergelijken die niet op dezelfde plaats liggen.
{
  const invoer = ligger({
    loads: [
      { beamId: 1, q: -10, caseId: 1 },                                   // G, volle lengte
      { beamId: 1, q: -8, startFrac: 1500 / L, endFrac: 4200 / L, caseId: 2 }, // Q, deellast
    ],
    cases: [{ id: 1, name: "G" }, { id: 2, name: "Q" }],
  });
  const { perCase } = solveAllCases(invoer);
  const g = perCase.get(1).elements.get(1);
  const q = perCase.get(2).elements.get(1);
  checkWaar("beide gevallen hebben evenveel stations",
    g.stations_mm.length === q.stations_mm.length && g.stations_mm.length === 63,
    `${g.stations_mm.length} / ${q.stations_mm.length}`);
  let zelfdeRaster = true;
  for (let i = 0; i < g.stations_mm.length; i++) {
    if (!Object.is(g.stations_mm[i], q.stations_mm[i])) { zelfdeRaster = false; break; }
  }
  checkWaar("de stationsreeksen zijn bitgelijk", zelfdeRaster);
  checkWaar("de deellastgrenzen zitten in BEIDE rasters",
    aantalBijX(g, 1500) === 2 && aantalBijX(g, 4200) === 2);

  // Geval G alleen: M(x) = q·x·(L−x)/2 op elk station — ook op de stations die
  // alleen dankzij de deellast van geval Q bestaan.
  let ergste = 0;
  for (let i = 0; i < g.stations_mm.length; i++) {
    const x = g.stations_mm[i];
    const verwacht = 10 * x * (L - x) / 2;
    const schaal = 10 * L * L / 8;
    ergste = Math.max(ergste, Math.abs(g.bendingMoment[i] - verwacht) / schaal);
  }
  checkWaar("geval G volgt q·x·(L−x)/2 op alle 63 stations", ergste <= 1e-9,
    `grootste afwijking ${ergste.toExponential(2)}`);

  // Superpositie: G + Q op stationsniveau tegen een solve met beide lasten in
  // één geval. Dezelfde stations, dus gewoon term voor term.
  const samen = solve(ligger({
    loads: [
      { beamId: 1, q: -10 },
      { beamId: 1, q: -8, startFrac: 1500 / L, endFrac: 4200 / L },
    ],
  })).elements.get(1);
  let ergsteSom = 0;
  const schaalSom = Math.max(...samen.bendingMoment.map(Math.abs));
  for (let i = 0; i < samen.bendingMoment.length; i++) {
    ergsteSom = Math.max(ergsteSom,
      Math.abs(g.bendingMoment[i] + q.bendingMoment[i] - samen.bendingMoment[i]) / schaalSom);
  }
  checkWaar("M(G) + M(Q) = M(G+Q) op elk station", ergsteSom <= 1e-9,
    `grootste afwijking ${ergsteSom.toExponential(2)}`);
}

log(`\n═══ TOTAAL: ${passed} geslaagd, ${failed} gefaald ═══`);
process.exit(failed === 0 ? 0 : 1);
