// Belastingen kopiëren naar een ander belastinggeval — de pure store-logica
// achter "selecteer alle lasten van deze soort" + Ctrl+C / Ctrl+V.
//
// Regels onder test:
//   - selecteerLastenVanZelfdeSoort: zelfde lasttype ÉN zelfde belastinggeval,
//     in modelvolgorde, referentielast inbegrepen; onbekend id → leeg
//   - kopieerLastenNaarKlembord: id en generatorherkomst eraf, alle overige
//     velden (richting, assenstelsel, deellast-fracties) intact; origineel
//     ongemoeid
//   - computeLastenPlakken: nieuwe id's boven het hoogste bestaande id, het
//     doel-belastinggeval gezet, bestaande lasten onaangeroerd
//   - inhoudelijk identieke last stond er al → overgeslagen (twee keer plakken
//     verdubbelt de belasting dus niet stilzwijgend)
//   - staaf/knoop/plaat verdwenen tussen kopiëren en plakken → verweesd
//   - REKENKUNDIG: het doelgeval geeft na plakken exact dezelfde reacties en
//     snedekrachten als het brongeval
//   - laatsteLastwaarden: sessiegeheugen voor de voorgevulde invoerwaarden
//
// Uitvoeren: npx tsx test-lasten-kopieren.mjs

const {
  selecteerLastenVanZelfdeSoort,
  kopieerLastenNaarKlembord,
  computeLastenPlakken,
} = await import("./src/hooks/useFemStore.ts");
const { solve } = await import("./src/components/fem/solver/engine.ts");
const {
  lastwaarden, isOnthouden, onthoudLastwaarden, vergeetLastwaarden,
  STANDAARD_LASTWAARDEN,
} = await import("./src/lib/laatsteLastwaarden.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function checkTrue(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}
function checkExact(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected}`); }
}
function checkNum(name, actual, expected, tol = 1e-6) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (ok) { passed++; log(`  ✓ ${name}: ${actual.toFixed(6)}`); }
  else    { failed++; log(`  ✗ ${name}: ${actual} vs ${expected}`); }
}
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Referentiemodel: portaal 6 × 4 m, twee scharnieren ───────────────────
const E = 210000, A = 3877, I = 1e8;   // N/mm², mm², mm⁴
const NODES = [
  { id: 1, x: 0,    z: 0    }, { id: 2, x: 6000, z: 0    },
  { id: 3, x: 0,    z: 4000 }, { id: 4, x: 6000, z: 4000 },
];
const BEAMS = [
  { id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 },
];
const SUPPORTS = [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }];

/** Lasten in geval 1, met bewust alle interessante velden bezet. */
function basisLasten() {
  return [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 3, q: -8 },
    {
      id: 2, type: "lineLoad", caseId: 1, beamId: 1, q: -3,
      qDir: "x", qCoord: "local", startFrac: 0.25, endFrac: 0.75,
    },
    { id: 3, type: "pointForce",  caseId: 1, nodeId: 4, fx: 0, fz: -12 },
    { id: 4, type: "thermal",     caseId: 1, beamId: 3, deltaT: 15 },
    { id: 5, type: "pointMoment", caseId: 1, nodeId: 3, my: 7 },
    // Een tweede lijnlast in een ÁNDER geval — mag nooit meegeselecteerd
    // worden, ook al is het dezelfde soort op dezelfde staaf.
    { id: 6, type: "lineLoad", caseId: 2, beamId: 2, q: -4, qDir: "x" },
    // Een gegenereerde windlast: gaat wél mee, maar verliest zijn herkomst.
    {
      id: 7, type: "lineLoad", caseId: 1, beamId: 2, q: -2,
      qDir: "x", gegenereerdDoor: "wind",
    },
  ];
}
const model = () => ({
  nodes: NODES, beams: BEAMS, plates: [], supports: SUPPORTS,
  loads: basisLasten(),
});

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] selecteerLastenVanZelfdeSoort: zelfde soort én zelfde geval");
{
  const loads = basisLasten();
  const lijn = selecteerLastenVanZelfdeSoort(loads, 1);
  checkTrue("alle lijnlasten van geval 1, in modelvolgorde",
    deepEq(lijn, [1, 2, 7]), JSON.stringify(lijn));
  checkTrue("referentielast zit er zelf bij", lijn.includes(1));
  checkTrue("lijnlast uit een ander geval blijft buiten de selectie",
    !lijn.includes(6));
  checkTrue("vanaf de gegenereerde last dezelfde set",
    deepEq(selecteerLastenVanZelfdeSoort(loads, 7), [1, 2, 7]));
  checkTrue("puntlast → alleen de puntlast",
    deepEq(selecteerLastenVanZelfdeSoort(loads, 3), [3]));
  checkTrue("moment → alleen het moment",
    deepEq(selecteerLastenVanZelfdeSoort(loads, 5), [5]));
  checkTrue("temperatuurlast → alleen de temperatuurlast",
    deepEq(selecteerLastenVanZelfdeSoort(loads, 4), [4]));
  checkTrue("selectie vanuit geval 2 blijft in geval 2",
    deepEq(selecteerLastenVanZelfdeSoort(loads, 6), [6]));
  checkTrue("onbekend id → lege selectie",
    deepEq(selecteerLastenVanZelfdeSoort(loads, 999), []));
  checkTrue("lege lastenlijst → lege selectie",
    deepEq(selecteerLastenVanZelfdeSoort([], 1), []));
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] kopieerLastenNaarKlembord: id en herkomst eraf, rest intact");
{
  const loads = basisLasten();
  const klembord = kopieerLastenNaarKlembord(loads, [1, 2, 7]);
  checkExact("drie lasten op het klembord", klembord.length, 3);
  checkTrue("geen enkel id meer op het klembord",
    klembord.every(l => l.id === undefined));
  checkTrue("generatorherkomst is eraf gehaald",
    klembord.every(l => l.gegenereerdDoor === undefined));
  const deel = klembord[1];
  checkTrue("richting, assenstelsel en deellast-fracties gaan mee",
    deel.qDir === "x" && deel.qCoord === "local"
    && deel.startFrac === 0.25 && deel.endFrac === 0.75);
  checkTrue("waarde en doelstaaf gaan mee", deel.q === -3 && deel.beamId === 1);
  checkTrue("origineel is niet gemuteerd",
    deepEq(loads, basisLasten()));
  checkTrue("onbekende id's leveren niets op",
    kopieerLastenNaarKlembord(loads, [999]).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] computeLastenPlakken: nieuwe id's, doelgeval, origineel ongemoeid");
{
  const cur = model();
  const klembord = kopieerLastenNaarKlembord(cur.loads, [1, 2, 3, 4, 5, 7]);
  const r = computeLastenPlakken(cur, klembord, 3);
  checkExact("alle zes geplakt", r.geplakt, 6);
  checkExact("niets overgeslagen", r.overgeslagen, 0);
  checkExact("niets verweesd", r.verweesd, 0);
  checkExact("lastenlijst is gegroeid", r.loads.length, cur.loads.length + 6);

  const nieuw = r.loads.slice(cur.loads.length);
  checkTrue("alle nieuwe lasten staan in het doelgeval",
    nieuw.every(l => l.caseId === 3));
  checkTrue("nieuwe id's lopen door boven het hoogste bestaande id",
    nieuw.every(l => l.id > 7));
  checkExact("alle id's uniek", new Set(r.loads.map(l => l.id)).size, r.loads.length);
  checkTrue("de bestaande lasten zijn onveranderd",
    deepEq(r.loads.slice(0, cur.loads.length), basisLasten()));
  checkTrue("geplakte windlast is handwerk geworden (geen herkomst meer)",
    nieuw.every(l => l.gegenereerdDoor === undefined));
  const geplakteDeel = nieuw.find(l => l.beamId === 1 && l.type === "lineLoad");
  checkTrue("deellast-fracties overleven het plakken",
    geplakteDeel.startFrac === 0.25 && geplakteDeel.endFrac === 0.75
    && geplakteDeel.qCoord === "local");
  const geplaktMoment = nieuw.find(l => l.type === "pointMoment");
  checkTrue("moment komt met knoop en waarde mee",
    geplaktMoment.nodeId === 3 && geplaktMoment.my === 7);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Twee keer plakken verdubbelt de belasting niet");
{
  const cur = model();
  const klembord = kopieerLastenNaarKlembord(cur.loads, [1, 2, 3]);
  const eerste = computeLastenPlakken(cur, klembord, 3);
  checkExact("eerste keer: drie geplakt", eerste.geplakt, 3);
  const tweede = computeLastenPlakken(
    { ...cur, loads: eerste.loads }, klembord, 3);
  checkExact("tweede keer: niets geplakt", tweede.geplakt, 0);
  checkExact("tweede keer: alles overgeslagen", tweede.overgeslagen, 3);
  checkTrue("lastenlijst blijft dezelfde array bij nul toevoegingen",
    tweede.loads === eerste.loads);

  // Terugplakken in het BRONgeval: daar staan ze al, dus ook niets.
  const terug = computeLastenPlakken(cur, klembord, 1);
  checkExact("terugplakken in het brongeval → alles overgeslagen",
    terug.overgeslagen, 3);
  checkExact("terugplakken plakt niets", terug.geplakt, 0);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Klembord met dubbele inhoud levert één last op");
{
  const cur = { ...model(), loads: [] };
  const klembord = [
    { type: "lineLoad", caseId: 1, beamId: 3, q: -8 },
    { type: "lineLoad", caseId: 1, beamId: 3, q: -8 },
    { type: "lineLoad", caseId: 1, beamId: 3, q: -9 },
  ];
  const r = computeLastenPlakken(cur, klembord, 2);
  checkExact("identieke tweede last overgeslagen", r.overgeslagen, 1);
  checkExact("twee verschillende lasten geplakt", r.geplakt, 2);
  checkExact("eerste id in een leeg model is 1", r.loads[0].id, 1);
  checkExact("tweede id is 2", r.loads[1].id, 2);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[6] Doel verdwenen tussen kopiëren en plakken → verweesd");
{
  const cur = model();
  const klembord = [
    { type: "lineLoad",   caseId: 1, beamId: 99, q: -8 },   // staaf weg
    { type: "pointForce", caseId: 1, nodeId: 99, fz: -5 },  // knoop weg
    { type: "edgeLoad",   caseId: 1, plateId: 99, edge: "top", q: -2 }, // plaat weg
    { type: "lineLoad",   caseId: 1, beamId: 3,  q: -1 },   // bestaat wél
  ];
  const r = computeLastenPlakken(cur, klembord, 2);
  checkExact("drie lasten zonder aangrijpingspunt vervallen", r.verweesd, 3);
  checkExact("de last op een bestaande staaf wordt geplakt", r.geplakt, 1);
  checkTrue("geplakte last hangt aan staaf 3",
    r.loads[r.loads.length - 1].beamId === 3);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[7] Rekenkundig: het doelgeval rekent identiek aan het brongeval");
{
  // Alleen mechanisch relevante lasten (geen temperatuur, die vraagt α uit het
  // materiaal en staat hier los van de vraag "komt de last exact over").
  const bron = [
    { id: 1, type: "lineLoad",   caseId: 1, beamId: 3, q: -8 },
    { id: 2, type: "lineLoad",   caseId: 1, beamId: 1, q: -3, qDir: "x",
      startFrac: 0.25, endFrac: 0.75 },
    { id: 3, type: "pointForce", caseId: 1, nodeId: 4, fx: 0, fz: -12 },
    { id: 4, type: "pointMoment", caseId: 1, nodeId: 3, my: 7 },
  ];
  const cur = { nodes: NODES, beams: BEAMS, plates: [], supports: SUPPORTS, loads: bron };
  const klembord = kopieerLastenNaarKlembord(bron, [1, 2, 3, 4]);
  const na = computeLastenPlakken(cur, klembord, 5);
  checkExact("vier lasten geplakt in geval 5", na.geplakt, 4);

  /** Bouw de solverinvoer voor één belastinggeval. q: kN/m = N/mm, F: kN → N. */
  const invoerVoorGeval = (loads, caseId) => ({
    nodes: NODES,
    beams: BEAMS.map(b => ({ ...b, E, A, I })),
    supports: SUPPORTS,
    loads: loads.filter(l => l.caseId === caseId && l.type === "lineLoad")
      .map(l => ({
        beamId: l.beamId, q: l.q, qDir: l.qDir, qCoord: l.qCoord,
        startFrac: l.startFrac, endFrac: l.endFrac,
      })),
    pointLoads: loads
      .filter(l => l.caseId === caseId
        && (l.type === "pointForce" || l.type === "pointMoment")
        && l.nodeId !== undefined)
      .map(l => ({
        nodeId: l.nodeId,
        fx: (l.fx ?? 0) * 1000, fz: (l.fz ?? 0) * 1000,
        my: (l.my ?? 0) * 1e6,
      })),
  });

  const rBron = solve(invoerVoorGeval(na.loads, 1));
  const rDoel = solve(invoerVoorGeval(na.loads, 5));

  for (const nodeId of [1, 2]) {
    const a = rBron.reactions.get(nodeId), b = rDoel.reactions.get(nodeId);
    checkNum(`reactie knoop ${nodeId} — Fx gelijk`, b.fx, a.fx, 1e-6);
    checkNum(`reactie knoop ${nodeId} — Fz gelijk`, b.fz, a.fz, 1e-6);
  }
  checkTrue("het brongeval draagt daadwerkelijk last (geen loze vergelijking)",
    Math.abs(rBron.reactions.get(1).fz) > 1000);
  for (const beamId of [1, 2, 3]) {
    const a = rBron.elements.get(beamId), b = rDoel.elements.get(beamId);
    const grootsteM = Math.max(...a.bendingMoment.map(Math.abs));
    const afwijkingM = Math.max(
      ...a.bendingMoment.map((m, i) => Math.abs(m - b.bendingMoment[i])));
    const afwijkingV = Math.max(
      ...a.shearForce.map((v, i) => Math.abs(v - b.shearForce[i])));
    checkTrue(`staaf ${beamId}: M over alle 21 stations gelijk`
      + ` (max |M| = ${(grootsteM / 1e6).toFixed(2)} kNm)`,
      afwijkingM <= 1e-6, `afwijking ${afwijkingM}`);
    checkTrue(`staaf ${beamId}: V over alle 21 stations gelijk`,
      afwijkingV <= 1e-6, `afwijking ${afwijkingV}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[8] laatsteLastwaarden: sessiegeheugen voor de voorgevulde waarden");
{
  vergeetLastwaarden();
  checkTrue("vers: nog niets onthouden", !isOnthouden("lijnlast"));
  checkExact("vers: de vertrouwde beginwaarde −5 kN/m",
    lastwaarden("lijnlast").q, STANDAARD_LASTWAARDEN.lijnlast.q);

  onthoudLastwaarden("lijnlast", { q: -8, qDir: "z" });
  checkTrue("na plaatsing: gemarkeerd als onthouden", isOnthouden("lijnlast"));
  checkExact("volgende plaatsing begint bij −8 kN/m", lastwaarden("lijnlast").q, -8);
  checkTrue("andere soorten blijven onaangeraakt", !isOnthouden("puntlastV"));
  checkExact("puntlast houdt zijn eigen beginwaarde",
    lastwaarden("puntlastV").fz, STANDAARD_LASTWAARDEN.puntlastV.fz);

  onthoudLastwaarden("lijnlast", { q: Number.NaN, qDir: "x" });
  checkExact("een leeg/ongeldig veld laat de vorige waarde staan",
    lastwaarden("lijnlast").q, -8);
  checkExact("de richting is wél bijgewerkt", lastwaarden("lijnlast").qDir, "x");

  onthoudLastwaarden("puntlastH", { fx: 25, fz: 0 });
  checkExact("horizontale puntlast heeft zijn eigen geheugen",
    lastwaarden("puntlastH").fx, 25);
  checkExact("verticale puntlast is daar niet door veranderd",
    lastwaarden("puntlastV").fx, STANDAARD_LASTWAARDEN.puntlastV.fx);

  vergeetLastwaarden();
  checkTrue("wissen zet alles terug op de beginwaarden",
    !isOnthouden("lijnlast") && !isOnthouden("puntlastH")
    && lastwaarden("lijnlast").q === STANDAARD_LASTWAARDEN.lijnlast.q);
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[9] Omschrijving: gaat mee bij kopiëren, telt niet mee in de signatuur");
{
  const loads = [
    { id: 1, type: "lineLoad", caseId: 1, beamId: 3, q: -8,
      omschrijving: "sneeuw op overstek" },
    { id: 2, type: "pointForce", caseId: 1, nodeId: 4, fx: 0, fz: -12,
      omschrijving: "reactie spant 3" },
  ];
  const klembord = kopieerLastenNaarKlembord(loads, [1, 2]);
  checkExact("omschrijving van de lijnlast staat op het klembord",
    klembord[0].omschrijving, "sneeuw op overstek");
  checkExact("omschrijving van de puntlast staat op het klembord",
    klembord[1].omschrijving, "reactie spant 3");

  const cur = { nodes: NODES, beams: BEAMS, plates: [], supports: SUPPORTS, loads };
  const r = computeLastenPlakken(cur, klembord, 2);
  checkExact("beide lasten geplakt in geval 2", r.geplakt, 2);
  const nieuw = r.loads.slice(loads.length);
  checkExact("de geplakte kopie draagt dezelfde omschrijving",
    nieuw[0].omschrijving, "sneeuw op overstek");

  // De duplicaatbewaking kijkt naar de MECHANICA, niet naar de naam: een last
  // hernoemen mag hem niet alsnog naast zijn tweelingbroer laten landen —
  // dan zou de belasting stil verdubbelen.
  const hernoemd = klembord.map(l => ({ ...l, omschrijving: "andere naam" }));
  const nogmaals = computeLastenPlakken(
    { ...cur, loads: r.loads }, hernoemd, 2);
  checkExact("hernoemde kopie wordt alsnog overgeslagen", nogmaals.geplakt, 0);
  checkExact("en telt als overgeslagen", nogmaals.overgeslagen, 2);

  // Zonder omschrijving verandert er niets aan het bestaande gedrag.
  const kaal = kopieerLastenNaarKlembord(basisLasten(), [1]);
  checkTrue("een last zonder omschrijving krijgt er geen",
    kaal[0].omschrijving === undefined);
}

// ─────────────────────────────────────────────────────────────────────────
log(`\n${"─".repeat(60)}`);
log(`Resultaat: ${passed} geslaagd, ${failed} gefaald`);
if (failed > 0) process.exit(1);
