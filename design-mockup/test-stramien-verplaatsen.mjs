// Unit-checks voor het verplaatsen van een stramienas MET de knopen die erop
// liggen (useFemStore: knopenOpStramienAs / berekenStramienVerplaatsing, de
// pure kern onder de mutator `verplaatsStramienAs`).
//
// Regels onder test:
//   - knopen ÓP de as (tolerantie 1 mm op x resp. z) schuiven exact mee;
//     knopen ernaast blijven op hun absolute positie staan
//   - meerdere knopen op dezelfde as (kolomlijn over verdiepingen) gaan
//     allemaal mee — ook knopen die niet aan een staaf hangen
//   - GEKOZEN GEDRAG "lokale maat": alleen de bewerkte as schuift. Bij
//     stramien A-B-C en een wijziging van maat A-B blijft C op zijn absolute
//     positie; de maat B-C verandert dus zichtbaar mee. Identiek voor niveaus.
//   - staaflengtes volgen de nieuwe knoopposities; topologie ongewijzigd
//   - lasten (lijnlast, deellast, puntlast, moment) blijven ongemoeid
//   - as-verplaatsing + knoopverplaatsing zijn SAMEN één undo-stap: één keer
//     undo zet knopen én stramien exact terug
// Uitvoeren: npx tsx test-stramien-verplaatsen.mjs

const {
  knopenOpStramienAs,
  berekenStramienVerplaatsing,
  STRAMIEN_TOL_MM,
} = await import("./src/hooks/useFemStore.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function check(name, cond, detail = "") {
  if (cond) { passed++; log(`  ✓ ${name}`); }
  else      { failed++; log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function node(state, id) { return state.nodes.find(n => n.id === id); }

function beamLength(state, beamId) {
  const b = state.beams.find(x => x.id === beamId);
  const a = node(state, b.from), c = node(state, b.to);
  return Math.hypot(c.x - a.x, c.z - a.z);
}

/**
 * Spiegelt exact wat de store-mutator `verplaatsStramienAs` doet, maar dan op
 * een plain snapshot-object zodat het analytisch te controleren is: nieuwe
 * knopen + nieuw stramien in ÉÉN snapshot (dus één undo-stap).
 */
function verplaatsStramienAs(state, as, axisId, nieuwePositie) {
  const lijst = as === "x" ? state.structuralGrid.xAxes : state.structuralGrid.zAxes;
  const doelAs = lijst.find(a => a.id === axisId);
  if (!doelAs) return null;
  const v = berekenStramienVerplaatsing(state.nodes, as, doelAs.position, nieuwePositie);
  if (v.delta === 0) return null;
  const idSet = new Set(v.nodeIds);
  const nodes = state.nodes.map(n =>
    idSet.has(n.id) ? { ...n, x: n.x + v.dx, z: n.z + v.dz } : n);
  const schuif = (l) => l.map(a => a.id === axisId ? { ...a, position: nieuwePositie } : a);
  return {
    snapshot: {
      ...state,
      nodes,
      structuralGrid: {
        ...state.structuralGrid,
        xAxes: as === "x" ? schuif(state.structuralGrid.xAxes) : state.structuralGrid.xAxes,
        zAxes: as === "z" ? schuif(state.structuralGrid.zAxes) : state.structuralGrid.zAxes,
      },
    },
    aantalKnopen: v.nodeIds.length,
    delta: v.delta,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Testmodel: portaal met kolomlijnen op A (x=0), B (x=6000) en C (x=12000),
// niveaus op ±0,00 (z=0) en +4,00 (z=4000). Knoop 5 hangt op halve
// overspanning (x=3000) en ligt dus op GEEN enkele as.
// ─────────────────────────────────────────────────────────────────────────
function maakModel() {
  return {
    nodes: [
      { id: 1, x: 0,     z: 0 },      // as A, onderbouw
      { id: 2, x: 0,     z: 4000 },   // as A, verdieping
      { id: 3, x: 6000,  z: 0 },      // as B, onderbouw
      { id: 4, x: 6000,  z: 4000 },   // as B, verdieping
      { id: 5, x: 3000,  z: 4000 },   // tussenknoop, niet op een as
      { id: 6, x: 12000, z: 0 },      // as C
      { id: 7, x: 6000,  z: 2000 },   // as B, losse knoop zonder staaf
    ],
    beams: [
      { id: 1, from: 1, to: 2, material: "S235", profile: "HEA160" }, // kolom A
      { id: 2, from: 3, to: 4, material: "S235", profile: "HEA160" }, // kolom B
      { id: 3, from: 2, to: 5, material: "S235", profile: "IPE300" }, // ligger links
      { id: 4, from: 5, to: 4, material: "S235", profile: "IPE300" }, // ligger rechts
    ],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 3, type: "pinned" }],
    plates: [],
    loads: [
      { id: 1, type: "lineLoad",   caseId: 1, beamId: 4, q: -5 },
      { id: 2, type: "lineLoad",   caseId: 1, beamId: 3, q: -8, startFrac: 0.25, endFrac: 0.75 },
      { id: 3, type: "pointForce", caseId: 2, nodeId: 4, fz: -12 },
      { id: 4, type: "pointMoment", caseId: 2, nodeId: 2, my: 7 },
    ],
    structuralGrid: {
      enabled: true,
      xAxes: [
        { id: "A", label: "A", position: 0 },
        { id: "B", label: "B", position: 6000 },
        { id: "C", label: "C", position: 12000 },
      ],
      zAxes: [
        { id: "z0", label: "", position: 0 },
        { id: "z1", label: "", position: 4000 },
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 1: knopenOpStramienAs — selectie en tolerantie
// ─────────────────────────────────────────────────────────────────────────
log("\n[1] knopenOpStramienAs: exact de knopen op de as, tolerantie 1 mm");
{
  const m = maakModel();
  const opB = knopenOpStramienAs(m.nodes, "x", 6000);
  check("as B levert knoop 3, 4 en 7", deepEq([...opB].sort((a, b) => a - b), [3, 4, 7]),
    `kreeg ${JSON.stringify(opB)}`);
  const opNiveau = knopenOpStramienAs(m.nodes, "z", 4000);
  check("niveau +4,00 levert knoop 2, 4 en 5", deepEq([...opNiveau].sort((a, b) => a - b), [2, 4, 5]),
    `kreeg ${JSON.stringify(opNiveau)}`);
  check("tolerantie is 1 mm", STRAMIEN_TOL_MM === 1);

  const rand = [
    { id: 10, x: 5999.5, z: 0 },  // binnen 1 mm  → mee
    { id: 11, x: 6001,   z: 0 },  // exact 1 mm   → mee
    { id: 12, x: 6002,   z: 0 },  // 2 mm ernaast → blijft
  ];
  const opRand = knopenOpStramienAs(rand, "x", 6000);
  check("0,5 mm en 1,0 mm ernaast schuiven mee, 2 mm niet",
    deepEq(opRand, [10, 11]), `kreeg ${JSON.stringify(opRand)}`);
  check("lege knopenlijst → lege selectie", knopenOpStramienAs([], "x", 0).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 2: verticale as B 1000 mm naar rechts — knopen, lengtes, lasten
// ─────────────────────────────────────────────────────────────────────────
log("\n[2] As B van 6000 → 7000 mm: knopen op B mee, rest blijft staan");
{
  const start = maakModel();
  const r = verplaatsStramienAs(start, "x", "B", 7000);
  check("resultaat niet null", r !== null);
  check("verplaatsing is exact 1000 mm", r.delta === 1000);
  check("3 knopen meegeschoven", r.aantalKnopen === 3, `kreeg ${r.aantalKnopen}`);
  const s = r.snapshot;

  check("knoop 3 → x = 7000", node(s, 3).x === 7000 && node(s, 3).z === 0);
  check("knoop 4 → x = 7000", node(s, 4).x === 7000 && node(s, 4).z === 4000);
  check("knoop 7 (losse knoop op B) → x = 7000",
    node(s, 7).x === 7000 && node(s, 7).z === 2000);
  check("knoop 1 en 2 (as A) onveranderd",
    node(s, 1).x === 0 && node(s, 2).x === 0);
  check("knoop 5 (tussenknoop, geen as) onveranderd",
    node(s, 5).x === 3000 && node(s, 5).z === 4000);
  check("knoop 6 (as C, voorbij B) blijft absoluut staan", node(s, 6).x === 12000);

  check("as B staat op 7000", s.structuralGrid.xAxes.find(a => a.id === "B").position === 7000);
  check("as A onveranderd op 0", s.structuralGrid.xAxes.find(a => a.id === "A").position === 0);
  check("as C onveranderd op 12000 (lokale maat, geen kettingmaat)",
    s.structuralGrid.xAxes.find(a => a.id === "C").position === 12000);
  check("niveaus ongemoeid", deepEq(s.structuralGrid.zAxes, start.structuralGrid.zAxes));

  // Staaflengtes
  check("kolom A blijft 4000 mm", beamLength(s, 1) === 4000);
  check("kolom B blijft 4000 mm (schuift als geheel mee)", beamLength(s, 2) === 4000);
  check("ligger 2→5 blijft 3000 mm", beamLength(s, 3) === 3000);
  check("ligger 5→4 rekt van 3000 naar 4000 mm", beamLength(s, 4) === 4000,
    `kreeg ${beamLength(s, 4)}`);
  check("topologie ongewijzigd", deepEq(s.beams, start.beams));
  check("opleggingen ongewijzigd", deepEq(s.supports, start.supports));

  // Lasten
  check("lasten volledig intact", deepEq(s.loads, start.loads));
  check("lijnlast op de opgerekte staaf intact (q en staaf-id)",
    s.loads[0].beamId === 4 && s.loads[0].q === -5);
  check("deellast houdt startFrac/endFrac",
    s.loads[1].startFrac === 0.25 && s.loads[1].endFrac === 0.75);
  check("puntlast op meegeschoven knoop 4 blijft aan knoop 4 hangen",
    s.loads[2].nodeId === 4 && s.loads[2].fz === -12);

  // Startmodel mag niet muteren (snapshots moeten onafhankelijk zijn)
  check("origineel model ongemoeid", node(start, 3).x === 6000 && node(start, 4).x === 6000);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 3: niveau +4,00 → +5,00 — zelfde gedrag in de andere richting
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Niveau z1 van 4000 → 5000 mm: knopen op dat niveau mee");
{
  const start = maakModel();
  const r = verplaatsStramienAs(start, "z", "z1", 5000);
  const s = r.snapshot;
  check("3 knopen meegeschoven (2, 4, 5)", r.aantalKnopen === 3, `kreeg ${r.aantalKnopen}`);
  check("knoop 2 → z = 5000", node(s, 2).z === 5000 && node(s, 2).x === 0);
  check("knoop 4 → z = 5000", node(s, 4).z === 5000 && node(s, 4).x === 6000);
  check("knoop 5 → z = 5000 (ligt op het niveau, niet op een X-as)",
    node(s, 5).z === 5000 && node(s, 5).x === 3000);
  check("knoop 1, 3 en 6 (niveau ±0,00) blijven op z = 0",
    node(s, 1).z === 0 && node(s, 3).z === 0 && node(s, 6).z === 0);
  check("knoop 7 (z = 2000, geen niveau) blijft staan", node(s, 7).z === 2000);
  check("niveau z1 staat op 5000", s.structuralGrid.zAxes.find(a => a.id === "z1").position === 5000);
  check("niveau z0 onveranderd op 0", s.structuralGrid.zAxes.find(a => a.id === "z0").position === 0);
  check("X-assen ongemoeid", deepEq(s.structuralGrid.xAxes, start.structuralGrid.xAxes));
  check("kolommen rekken van 4000 naar 5000",
    beamLength(s, 1) === 5000 && beamLength(s, 2) === 5000);
  check("liggers blijven horizontaal 3000 mm",
    beamLength(s, 3) === 3000 && beamLength(s, 4) === 3000);
  check("lasten volledig intact", deepEq(s.loads, start.loads));
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 4: één undo-stap zet knopen ÉN stramien samen terug
// ─────────────────────────────────────────────────────────────────────────
log("\n[4] Undo: één stap herstelt knopen én stramien");
{
  const start = maakModel();
  const historie = [start];
  const r = verplaatsStramienAs(start, "x", "B", 7000);
  historie.push(r.snapshot);
  let idx = 1;

  check("verplaatsing kost precies één history-stap", historie.length === 2);
  check("na verplaatsen: knoop 4 op x = 7000", node(historie[idx], 4).x === 7000);

  idx -= 1; // ← Ctrl+Z
  const na = historie[idx];
  check("na undo: knopen exact terug", deepEq(na.nodes, start.nodes));
  check("na undo: stramien exact terug", deepEq(na.structuralGrid, start.structuralGrid));
  check("na undo: as B weer op 6000",
    na.structuralGrid.xAxes.find(a => a.id === "B").position === 6000);
  check("na undo: staaflengte 5→4 weer 3000 mm", beamLength(na, 4) === 3000);
  check("na undo: volledige snapshot gelijk aan begintoestand", deepEq(na, start));

  idx += 1; // ← Ctrl+Y (redo)
  check("redo: knoop 4 weer op x = 7000", node(historie[idx], 4).x === 7000);
  check("redo: as B weer op 7000",
    historie[idx].structuralGrid.xAxes.find(a => a.id === "B").position === 7000);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST 5: randgevallen
// ─────────────────────────────────────────────────────────────────────────
log("\n[5] Randgevallen: nul-verplaatsing, onbekende as, as zonder knopen");
{
  const start = maakModel();
  check("zelfde positie → geen actie (null)",
    verplaatsStramienAs(start, "x", "B", 6000) === null);
  check("onbekende as-id → null",
    verplaatsStramienAs(start, "x", "ZZ", 1000) === null);

  // As C heeft één knoop; een as zonder enkele knoop schuift wél, maar
  // verplaatst niets aan het model.
  const leeg = maakModel();
  leeg.nodes = leeg.nodes.filter(n => n.id !== 6);
  const r = verplaatsStramienAs(leeg, "x", "C", 13000);
  check("as zonder knopen: as schuift, 0 knopen mee", r !== null && r.aantalKnopen === 0);
  check("as zonder knopen: knopen exact ongewijzigd", deepEq(r.snapshot.nodes, leeg.nodes));
  check("as zonder knopen: as C staat op 13000",
    r.snapshot.structuralGrid.xAxes.find(a => a.id === "C").position === 13000);

  // Naar links verplaatsen (negatieve delta) werkt symmetrisch.
  const links = verplaatsStramienAs(start, "x", "B", 4500);
  check("negatieve delta: −1500 mm", links.delta === -1500);
  check("negatieve delta: knopen op B naar x = 4500",
    node(links.snapshot, 3).x === 4500 && node(links.snapshot, 4).x === 4500
    && node(links.snapshot, 7).x === 4500);
  check("negatieve delta: knoop 5 blijft op 3000", node(links.snapshot, 5).x === 3000);
}

log(`\n${failed === 0 ? "ALLE TESTS GESLAAGD" : "TESTS GEFAALD"} — ${passed} ok, ${failed} fout\n`);
process.exit(failed === 0 ? 0 : 1);
