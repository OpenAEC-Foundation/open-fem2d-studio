// Staafeinde op de rand van een OPENING in een plaat (issue #13, september 2026).
//
// WAT ER MISGING
//   De kinematische randkoppeling (engine.ts, `randKoppelingen`) keek alleen
//   naar de OMTREK. Een staaf die tussen twee randknopen van een opening
//   eindigde, hing in het CDT-pad met een losse kop in het model: gemeten op
//   master 3e35cb2 gaf model [2] hieronder "Het stelsel is singulier: knoop 31
//   … kan vrij verticaal verschuiven". Het RASTERPAD rekende hetzelfde al wel:
//   bij een plaat met openingen worden de coördinaten van staafknopen
//   dwingende gridlijnen, zodat de kolomvoet zelf een rekenknoop werd.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] RASTERPAD, vierhoeken én driehoeken — wand 4 × 3 m met een sparing
//       1500…2500 × 1000…2000 mm, meshSize 500. Een kolom staat op de
//       ONDERRAND van de sparing (rand 1: (1500,1000) → (2500,1000)) op
//       x = 1625; kop op (1625, 1800) met een rol in x en P = −20 kN.
//       (a) EVENWICHT: ΣFx, ΣFz en ΣM om de oorsprong van reacties + last = 0.
//       (b) HANDBEREKENING van de staaf: de kolom is aan beide einden
//           scharnierend (een membraan draagt geen moment, de rol laat de kop
//           vrij draaien) en draagt alleen P, dus N = −20 kN (druk) en de rol
//           neemt geen horizontale kracht op.
//       (c) ONAFHANKELIJKE CONTROLE: dezelfde wand zonder kolom, met P
//           rechtstreeks op een gewone knoop op de plaats van de voet (en
//           dezelfde gridlijnen). De plaat hoort precies hetzelfde te zien.
//       (d) REGEL TUSSEN TWEE OPENINGSRANDEN (x = 1500 en 2500, z = 1250), met
//           Fz = −10 kN in het midden: evenwicht en de handberekening van een
//           scharnierend opgelegde ligger (|V| = ½·P, M = P·L/4 in het midden).
//   [2] CDT-PAD, vierhoeken én driehoeken — de L-plaat 4 × 4 m met een
//       sparing 500…1500 × 2500…3500 uit test-plaat-opening-randlast.mjs,
//       met een handgemaakte meshcache; de openingsrandknopen komen uit
//       `openingEdgeNodeIndices`. Kolom op de onderrand van de sparing op
//       x = 875: tussen de randknopen x = 500 en x = 1000 op
//       t = (875 − 500)/500 = 0,75; langs de hele openingsrand (1000 mm vanaf
//       (500, 2500)) is dat fractie 375/1000 = 0,375. P = −20 kN.
//       EVENWICHT, N = −20 kN, COMPATIBILITEIT
//       uz(voet) = 0,25·uz(500) + 0,75·uz(1000), en de ONAFHANKELIJKE CONTROLE:
//       dezelfde plaat met een randpuntlast van −20 kN op openingsrand 1,
//       fractie 0,375 (adres `openingId` + `edgeIndex`, getest in
//       test-plaat-opening-randlast.mjs) geeft dezelfde plaatverplaatsingen.
//   [3] BIJNA OP DE RAND: een vrij staafeinde 4 à 5 mm van een openingsrand of
//       van de omtrek wordt NIET gekoppeld maar geweigerd, met rand en afstand,
//       in de engine (raster en CDT) én in de MCP-droogloop. Grens:
//       `STAAFEINDE_BIJ_RAND_MM` in femTypes (1 mm < d < 50 mm, met de
//       verantwoording daar). Op 1 mm (binnen de koppeltolerantie) wordt het
//       gewoon gekoppeld; een console die 60 mm vóór de rand ophoudt, valt
//       buiten de regel. De droogloop meldt ook een staaf die IN een sparing
//       zweeft als los deel (vroeger telde de sparing als plaat).
//   [4] BIT-IDENTIEK: modellen zonder staafeinde op een openingsrand rekenen
//       precies als vóór deze wijziging. Gemeten door dezelfde modellen te
//       draaien tegen de bron van master 3e35cb2 (`I13_METING=1 npx tsx <dit
//       bestand>` drukt de vingerafdrukken af) en tegen deze tak. De
//       vingerafdruk is de SHA-256 van ALLE reacties, verplaatsingen,
//       staafkrachten en plaatspanningen in volle dubbele precisie; één
//       afwijkende bit geeft een andere hash.
//   [5] MCP-ROUTE: de sidecar rekent een model met een kolom op een
//       openingsrand, en de droogloop keurt het goed.
//   De modelcontrole van het canvas valt buiten de barrel van de
//   sidecarbundel en staat in test-plaat-opening-staafeinde-controle.mjs.
//
// Uitvoeren: npx tsx test-plaat-opening-staafeinde.mjs   (vanuit design-mockup/)

import { createHash } from "node:crypto";

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { berekenPlaatMeshSignatuur } = await import("./src/components/fem/femTypes.ts");
const { zoekPuntenOpLijnstuk } = await import("./src/core/fem/PlaatMesher.ts");
const { valideerModel } = await import("./src/mcp/valideerModel.ts");
const { verwerkVerzoek } = await import("./src/mcp/sidecar.ts");

const METING = process.env.I13_METING === "1";
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
function probeer(name, f) {
  try { return f(); }
  catch (e) { checkTrue(name, false, e.message); return null; }
}

const T = 20, E = 210000, NU = 0.3;
const rect = (x0, z0, x1, z1) =>
  [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
// HE 200 A-achtige kolom: A = 5380 mm², I = 3,692·10⁷ mm⁴ (zelfde getallen
// als de kolom in test-plaat-randlasten.mjs; de waarde doet voor evenwicht en
// voor de gelijkheid met de randpuntlast niet ter zake).
const KOLOM = { E, A: 5380, I: 3.692e7 };
const eenGeval = (mi) => solveAllCases(mi).perCase.get(1);

/** ΣFx, ΣFz (N) en ΣM om de oorsprong (N·mm, M = x·Fz − z·Fx) van reacties plus uitwendige lasten. */
function evenwicht(r, nodes, uitwendig) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  let rx = 0, rz = 0, m = 0;
  for (const [id, re] of r.reactions) {
    const n = pos.get(id);
    rx += re.fx; rz += re.fz; m += n.x * re.fz - n.z * re.fx;
  }
  for (const u of uitwendig) { rx += u.fx; rz += u.fz; m += u.x * u.fz - u.z * u.fx; }
  return { rx, rz, m };
}

/** SHA-256 over het volledige resultaat, Maps als gesorteerde lijsten. */
function vingerafdruk(r) {
  const rij = (map) => [...map.entries()].sort((a, b) => a[0] - b[0]);
  const tekst = JSON.stringify({
    d: rij(r.displacements), r: rij(r.reactions),
    e: rij(r.elements).map(([id, el]) => [id, el.N, el.V, el.M_start, el.M_end, el.normalForce, el.shearForce, el.bendingMoment]),
    p: (r.plateElements ?? []).map((p) => [p.plateId, p.elements]),
  });
  return createHash("sha256").update(tekst).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────
// [1] Rasterpad
// ─────────────────────────────────────────────────────────────────────────
const OPENING = rect(1500, 1000, 2500, 2000);
// Knopen 1–9 op de onderrand (x = 0 … 4000, stap 500), 10 en 11 de bovenhoeken.
function wand(extra = {}, meshType = "vierhoeken", opening = OPENING) {
  const nodes = [];
  for (let i = 0; i <= 8; i++) nodes.push({ id: 1 + i, x: i * 500, z: 0 });
  nodes.push({ id: 10, x: 0, z: 3000 }, { id: 11, x: 4000, z: 3000 });
  return {
    nodes, beams: [],
    supports: nodes.slice(0, 9).map((n) => ({ nodeId: n.id, type: n.id === 5 ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{
      id: 1, nodeIds: [1, 9, 11, 10], thickness: T, E, nu: NU, rho: 7850, meshSize: 500, meshType,
      ...(opening ? { openingen: [{ id: 7, punten: opening }] } : {}),
    }],
    cases: [{ id: 1, name: "Q" }],
    ...extra,
  };
}
const P = -20000;
/** Kolom op de onderrand van de sparing: voet 30 (xVoet, zVoet), kop 31 (xVoet, 1800). */
function kolomOpOpening(meshType, xVoet = 1625, zVoet = 1000) {
  const b = wand({}, meshType);
  return wand({
    nodes: [...b.nodes, { id: 30, x: xVoet, z: zVoet }, { id: 31, x: xVoet, z: 1800 }],
    beams: [{ id: 1, from: 30, to: 31, ...KOLOM }],
    supports: [...b.supports, { nodeId: 31, type: "xRoller" }],
    pointLoads: [{ nodeId: 31, fz: P, caseId: 1 }],
  }, meshType);
}

// OPMERKING OVER HET RASTERPAD. Bij een rechthoekige plaat MET openingen
// worden de coördinaten van elke staaf-, opleggings- en puntlastknoop
// dwingende gridlijnen (`dwingendeLijnenUitKnopen`, engine.ts). De kolomvoet
// op (1625, 1000) wordt daardoor zelf een rekenknoop van het net en deelt die
// knoop met de plaat; de koppeling hoeft hier niets te doen. Gemeten op master
// 3e35cb2: dit model rekende daar al. De test legt vast dat dat zo blijft, en
// dat de uitbreiding van de koppeling er niets aan verandert. Het CDT-pad in
// [2] is waar de koppeling het werk doet.
log("\n[1] Rasterpad: staaf op de rand van een sparing in een wand 4 × 3 m");
for (const meshType of ["vierhoeken", "driehoeken"]) {
  const mi = kolomOpOpening(meshType);
  const r = probeer(`${meshType}: kolom op openingsrand rekent`, () => eenGeval(mi));
  if (!r) continue;
  // (a) Evenwicht. De enige uitwendige last is P op de kop (1625, 1800).
  const ev = evenwicht(r, mi.nodes, [{ x: 1625, z: 1800, fx: 0, fz: P }]);
  checkRel(`(a) ${meshType}: ΣFx = 0`, ev.rx, 0, 1e-9, 20000);
  checkRel(`(a) ${meshType}: ΣFz = 0 (P = −20 kN)`, ev.rz, 0, 1e-9, 20000);
  checkRel(`(a) ${meshType}: ΣM = 0 om (0,0) (arm x = 1625 mm)`, ev.m, 0, 1e-9, 20000 * 1625);
  // (b) Handberekening: N = P = −20 kN, de rol op de kop neemt niets op.
  checkRel(`(b) ${meshType}: normaalkracht kolom N = −20 kN (druk)`, r.elements.get(1).N, P, 1e-9);
  checkTrue(`(b) ${meshType}: de rol op de kop draagt geen horizontale kracht`,
    Math.abs(r.reactions.get(31).fx) < 1e-6 * 20000, `${r.reactions.get(31).fx} N`);
  // (c) Onafhankelijk: dezelfde wand zonder kolom, met P rechtstreeks op de
  //     voetknoop. Knoop 33 op (0, 1800) met een last 0 zorgt voor dezelfde
  //     dwingende gridlijn z = 1800 die de kolomkop gaf, zodat beide modellen
  //     exact hetzelfde net hebben. De kolom brengt P zuiver axiaal over, dus
  //     de plaat moet precies hetzelfde zien.
  const b = wand({}, meshType);
  const pl = eenGeval(wand({
    nodes: [...b.nodes, { id: 30, x: 1625, z: 1000 }, { id: 33, x: 0, z: 1800 }],
    pointLoads: [{ nodeId: 30, fz: P, caseId: 1 }, { nodeId: 33, fz: 0, caseId: 1 }],
  }, meshType));
  const d = (id) => r.displacements.get(id);
  for (const id of [10, 11, 30]) {
    checkRel(`(c) ${meshType}: kolom ≡ last op de voetknoop, uz knoop ${id}`, d(id).uz, pl.displacements.get(id).uz, 1e-9);
    checkRel(`(c) ${meshType}: kolom ≡ last op de voetknoop, ux knoop ${id}`, d(id).ux, pl.displacements.get(id).ux, 1e-9, Math.abs(pl.displacements.get(id).uz));
  }
  let maxAfw = 0;
  for (let id = 1; id <= 9; id++) maxAfw = Math.max(maxAfw, Math.abs(r.reactions.get(id).fz - pl.reactions.get(id).fz));
  checkRel(`(c) ${meshType}: kolom ≡ last op de voetknoop, reacties onderin`, maxAfw, 0, 1e-9, 20000);
  // Controle op de controle: dezelfde last op de omtrek-bovenrand (knoop 34
  // op (1625, 3000), zelfde gridlijnen) verdeelt de reacties anders.
  const omtrek = eenGeval(wand({
    nodes: [...b.nodes, { id: 34, x: 1625, z: 3000 }, { id: 33, x: 0, z: 1800 }],
    pointLoads: [{ nodeId: 34, fz: P, caseId: 1 }, { nodeId: 33, fz: 0, caseId: 1 }],
  }, meshType));
  let verschil = 0;
  for (let id = 1; id <= 9; id++) verschil = Math.max(verschil, Math.abs(r.reactions.get(id).fz - omtrek.reactions.get(id).fz));
  checkTrue(`(c) ${meshType}: dezelfde last op de omtrek verdeelt anders (de controle onderscheidt)`, verschil > 1, `${verschil.toFixed(1)} N`);
}
for (const meshType of ["vierhoeken", "driehoeken"]) {
  // (d) Horizontale regel 40 (1500,1250) – 41 (2000,1250) – 42 (2500,1250)
  //     tussen de linker- en de rechterrand van de sparing, Fz = −10 kN in 41.
  const b = wand({}, meshType);
  const mi = wand({
    nodes: [...b.nodes, { id: 40, x: 1500, z: 1250 }, { id: 41, x: 2000, z: 1250 }, { id: 42, x: 2500, z: 1250 }],
    beams: [{ id: 1, from: 40, to: 41, ...KOLOM }, { id: 2, from: 41, to: 42, ...KOLOM }],
    pointLoads: [{ nodeId: 41, fz: -10000, caseId: 1 }],
  }, meshType);
  const r = probeer(`${meshType}: regel tussen twee openingsranden rekent`, () => eenGeval(mi));
  if (!r) continue;
  const ev = evenwicht(r, mi.nodes, [{ x: 2000, z: 1250, fx: 0, fz: -10000 }]);
  checkRel(`(d) ${meshType}: ΣFz = 0 (−10 kN)`, ev.rz, 0, 1e-9, 10000);
  checkRel(`(d) ${meshType}: ΣFx = 0`, ev.rx, 0, 1e-9, 10000);
  checkRel(`(d) ${meshType}: ΣM = 0 (arm x = 2000 mm)`, ev.m, 0, 1e-9, 10000 * 2000);
  // Handberekening, scharnierend opgelegde ligger L = 1000 mm met P in het
  // midden: |V| = ½·P = 5 kN in beide helften, M = 0 aan de einden (een
  // membraan draagt geen moment) en M = P·L/4 = 10 000 N · 1000 mm / 4
  // = 2,5·10⁶ N·mm in het midden. De normaalkracht die de plaat in de regel
  // zet, ligt op de staafas en verandert daar niets aan.
  for (const id of [1, 2]) {
    checkRel(`(d) ${meshType}: |V| in deel ${id} = ½·P = 5 kN`, Math.abs(r.elements.get(id).V), 5000, 1e-6);
  }
  checkRel(`(d) ${meshType}: M aan het linkereind = 0`, r.elements.get(1).M_start, 0, 1e-6, 2.5e6);
  checkRel(`(d) ${meshType}: M in het midden = P·L/4 = 2,5·10⁶ N·mm`, Math.abs(r.elements.get(1).M_end), 2.5e6, 1e-6);
}

// ─────────────────────────────────────────────────────────────────────────
// [2] CDT-pad: L-plaat met sparing, handgemaakte meshcache
// ─────────────────────────────────────────────────────────────────────────
const L_HOEKEN = [
  { x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 4000, z: 2000 },
  { x: 2000, z: 2000 }, { x: 2000, z: 4000 }, { x: 0, z: 4000 },
];
const L_OPENING = rect(500, 2500, 1500, 3500);
function bouwLCache(meshType) {
  const S = 500, points = [], idx = new Map();
  const punt = (x, z) => {
    const k = `${x},${z}`;
    if (!idx.has(k)) { idx.set(k, points.length); points.push({ x, z }); }
    return idx.get(k);
  };
  const inL = (x, z) => z <= 2000 || x <= 2000;
  const inGat = (x, z) => x > 500 && x < 1500 && z > 2500 && z < 3500;
  const triangles = [], quads = [];
  for (let z = 0; z < 4000; z += S) for (let x = 0; x < 4000; x += S) {
    const xc = x + S / 2, zc = z + S / 2;
    if (!inL(xc, zc) || inGat(xc, zc)) continue;
    const lo = punt(x, z), ro = punt(x + S, z), rb = punt(x + S, z + S), lb = punt(x, z + S);
    if (meshType === "vierhoeken") quads.push([lo, ro, rb, lb]);
    else triangles.push([lo, ro, rb], [lo, rb, lb]);
  }
  return {
    signature: berekenPlaatMeshSignatuur(L_HOEKEN, 500, { openingen: [L_OPENING], meshType }),
    points, triangles, quads, meshSoort: meshType,
    edgeNodeIndices: L_HOEKEN.map((h, i) =>
      zoekPuntenOpLijnstuk(points, h, L_HOEKEN[(i + 1) % L_HOEKEN.length], 1e-6)),
    openingEdgeNodeIndices: [L_OPENING.map((h, j) =>
      zoekPuntenOpLijnstuk(points, h, L_OPENING[(j + 1) % L_OPENING.length], 1e-6))],
  };
}
function lModel(extra, meshType) {
  const nodes = L_HOEKEN.map((h, i) => ({ id: i + 1, x: h.x, z: h.z }));
  nodes.push({ id: 7, x: 1000, z: 0 }, { id: 8, x: 2000, z: 0 }, { id: 9, x: 3000, z: 0 },
    { id: 20, x: 500, z: 2500 }, { id: 21, x: 1000, z: 2500 });
  return {
    nodes, beams: [],
    supports: [1, 7, 8, 9, 2].map((id) => ({ nodeId: id, type: id === 8 ? "pinned" : "zRoller" })),
    loads: [],
    plates: [{
      id: 1, nodeIds: [1, 2, 3, 4, 5, 6], thickness: T, E, nu: NU, rho: 7850, meshSize: 500, meshType,
      openingen: [{ id: 3, punten: L_OPENING }], meshCache: bouwLCache(meshType),
    }],
    cases: [{ id: 1, name: "Q" }],
    ...extra,
  };
}

log("\n[2] CDT-pad: kolom op de onderrand van een sparing in een L-plaat");
for (const meshType of ["vierhoeken", "driehoeken"]) {
  const b = lModel({}, meshType);
  const mi = lModel({
    nodes: [...b.nodes, { id: 30, x: 875, z: 2500 }, { id: 31, x: 875, z: 3200 }],
    beams: [{ id: 1, from: 30, to: 31, ...KOLOM }],
    supports: [...b.supports, { nodeId: 31, type: "xRoller" }],
    pointLoads: [{ nodeId: 31, fz: P, caseId: 1 }],
  }, meshType);
  const r = probeer(`${meshType}: L-plaat met kolom op de sparing rekent`, () => eenGeval(mi));
  if (!r) continue;
  const ev = evenwicht(r, mi.nodes, [{ x: 875, z: 3200, fx: 0, fz: P }]);
  checkRel(`${meshType} L: ΣFx = 0`, ev.rx, 0, 1e-9, 20000);
  checkRel(`${meshType} L: ΣFz = 0 (P = −20 kN)`, ev.rz, 0, 1e-9, 20000);
  checkRel(`${meshType} L: ΣM = 0 (arm x = 875 mm)`, ev.m, 0, 1e-9, 20000 * 875);
  checkRel(`${meshType} L: N = −20 kN`, r.elements.get(1).N, P, 1e-9);
  const d = (id) => r.displacements.get(id);
  checkRel(`${meshType} L: uz(voet) = 0,25·uz(500) + 0,75·uz(1000)`,
    d(30).uz, 0.25 * d(20).uz + 0.75 * d(21).uz, 1e-12);
  const pl = eenGeval(lModel({ edgePointLoads: [{ plateId: 1, caseId: 1, openingId: 3, edgeIndex: 0, posFrac: 0.375, fz: P }] }, meshType));
  for (const id of [3, 4, 5, 6, 20, 21]) {
    checkRel(`${meshType} L: kolom ≡ randpuntlast, uz knoop ${id}`, d(id).uz, pl.displacements.get(id).uz, 1e-9);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// [3] Bijna op de rand: weigeren, niet stil koppelen
// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Bijna op de rand: melden in plaats van stil koppelen of los laten");
{
  // 5 mm boven de onderrand van de sparing, dus IN de sparing: geen plaat.
  weigert("raster: kolomvoet 5 mm van de openingsrand wordt geweigerd",
    () => eenGeval(kolomOpOpening("vierhoeken", 1625, 1005)),
    /^Plaat 1: het vrije staafeinde op knoop 30 ligt 5 mm van rand 1 van opening 7/);
  // 1 mm: binnen de tolerantie van de koppeling (TOL_MM = 1 in engine.ts,
  // dezelfde als voor de omtrek) → gekoppeld, geen weigering. Evenwicht.
  const opEen = probeer("raster: kolomvoet op 1 mm wordt gekoppeld", () => eenGeval(kolomOpOpening("vierhoeken", 1625, 1001)));
  if (opEen) {
    checkRel("raster: kolomvoet op 1 mm: ΣFz = 0", evenwicht(opEen, kolomOpOpening("vierhoeken", 1625, 1001).nodes, [{ x: 1625, z: 1800, fx: 0, fz: P }]).rz, 0, 1e-9, 20000);
  }
  // Omtrek: dezelfde grens. Kolom die 4 mm onder de bovenrand van een wand zonder opening hangt.
  const zonder = wand({}, "vierhoeken", null);
  weigert("omtrek: vrij staafeinde 4 mm onder de bovenrand wordt geweigerd",
    () => eenGeval(wand({
      nodes: [...zonder.nodes, { id: 30, x: 1250, z: 2996 }, { id: 31, x: 1250, z: 4000 }],
      beams: [{ id: 1, from: 30, to: 31, ...KOLOM }],
      supports: [...zonder.supports, { nodeId: 31, type: "pinned" }],
      pointLoads: [{ nodeId: 31, fz: P, caseId: 1 }],
    }, "vierhoeken", null)),
    /^Plaat 1: het vrije staafeinde op knoop 30 ligt 4 mm van rand 3 van de omtrek/);
  // CDT-pad: dezelfde weigering.
  const lb = lModel({}, "driehoeken");
  weigert("CDT: kolomvoet 5 mm van de openingsrand wordt geweigerd",
    () => eenGeval(lModel({
      nodes: [...lb.nodes, { id: 30, x: 875, z: 2505 }, { id: 31, x: 875, z: 3200 }],
      beams: [{ id: 1, from: 30, to: 31, ...KOLOM }],
      supports: [...lb.supports, { nodeId: 31, type: "xRoller" }],
      pointLoads: [{ nodeId: 31, fz: P, caseId: 1 }],
    }, "driehoeken")),
    /^Plaat 1: het vrije staafeinde op knoop 30 ligt 5 mm van rand 1 van opening 3/);
  // 60 mm: buiten de regel. Een ingeklemde console die 60 mm vóór de sparing
  // ophoudt is een geldige constructie en wordt niet geweigerd.
  const console60 = wand({
    nodes: [...wand().nodes, { id: 30, x: 1625, z: 1060 }, { id: 31, x: 1625, z: 1800 }],
    beams: [{ id: 1, from: 30, to: 31, ...KOLOM }],
    supports: [...wand().supports, { nodeId: 31, type: "fixed" }],
    pointLoads: [{ nodeId: 30, fx: 1000, caseId: 1 }],
  });
  const r60 = probeer("60 mm van de rand: geen weigering", () => eenGeval(console60));
  if (r60) checkRel("60 mm: de console draagt zijn eigen last (Rx op de inklemming = −1 kN)", r60.reactions.get(31).fx, -1000, 1e-9);

  // MCP-droogloop: dezelfde regel, al vóór het rekenen.
  const ui = (zVoet) => ({
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }, { id: 3, x: 4000, z: 3000 }, { id: 4, x: 0, z: 3000 },
      { id: 30, x: 1625, z: zVoet }, { id: 31, x: 1625, z: 1800 },
    ],
    beams: [{ id: 1, from: 30, to: 31, material: "S235", profile: "HEA 200" }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 31, type: "xRoller" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: T, E, nu: NU, rho: 7850, meshSize: 500,
      openingen: [{ id: 7, punten: OPENING }] }],
    loadCases: [{ id: 1, name: "Q", type: "live" }],
    loads: [{ id: 1, type: "pointForce", caseId: 1, nodeId: 31, fx: 0, fz: -20 }],
    selfWeightEnabled: false, scheefstandEnabled: false, scheefstandNoemer: 200, scheefstandRichting: 1,
  });
  const dg = valideerModel(ui(1005));
  checkTrue("MCP-droogloop: 5 mm van de openingsrand is een fout, met dezelfde reden",
    dg.ok === false && dg.errors.some((e) => /Plaat 1: het vrije staafeinde op knoop 30 ligt 5 mm van rand 1 van opening 7/.test(e)),
    JSON.stringify(dg.errors));
  const goed = valideerModel(ui(1000));
  checkTrue("MCP-droogloop: op de openingsrand is in orde", goed.ok === true, JSON.stringify(goed.errors));
  // Een knoop IN de sparing hoort niet bij de plaat: de droogloop telde hem
  // vroeger als "in de plaat" (alleen de omtrek werd bekeken) en zag het
  // losse deel dan niet. 300 mm boven de onderrand valt buiten de
  // bijna-regel, dus hier moet de mechanismemelding komen.
  const inGat = valideerModel({ ...ui(1300), supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }] });
  checkTrue("MCP-droogloop: een staaf die in de sparing zweeft is een los deel",
    inGat.ok === false && inGat.errors.some((e) => /constructiedeel met knopen 30, 31/.test(e)),
    JSON.stringify(inGat.errors));

  // [5] MCP-route: de sidecar rekent het goede model gelijk aan de app-engine.
  const antw = verwerkVerzoek({ v: 1, id: 1, op: "solve", payload: { model: ui(1000) } });
  checkTrue("MCP-route: solve slaagt", antw.ok === true, antw.error?.melding ?? "");
  const mcpR = antw.result?.per_case?.["1"]?.reactions ?? {};
  let somFz = 0;
  for (const re of Object.values(mcpR)) somFz += re.fz;
  checkRel("MCP-route: ΣRz = 20 kN", somFz, 20, 1e-9);
}

// ─────────────────────────────────────────────────────────────────────────
// [4] Bit-identiek zonder staafeinde op een openingsrand
// ─────────────────────────────────────────────────────────────────────────
// Gemeten tegen master 3e35cb2 met I13_METING=1; zie de kop van dit bestand.
//   A: wand 4 × 3 m ZONDER opening, kolom op de omtrek-bovenrand tussen twee
//      randknopen (x = 1250), vierhoeken — de bestaande omtrekkoppeling.
//   B: wand met sparing, kolom op de omtrek-bovenrand (x = 1250) en een
//      randlast op de sparing; vierhoeken en driehoeken. Openingen aanwezig,
//      maar geen staafeinde op een openingsrand.
//   C: L-plaat (CDT) met sparing, zelfde soort model, driehoeken.
const VINGERAFDRUKKEN = {
  A: "f23de78642590476c70b425fdc57c6d68648317e9a526e5c62809eb2056f5589",
  "B-vierhoeken": "b6e868a1841772cd6f9e673fd6018accee922c0ae9d053815fdeeda37d12d7ca",
  "B-driehoeken": "60110f720541f39c6c0ee8578cca5ea5dacb3ce5d066a8ec073de4fc0670d329",
  C: "1acbac01ec3257f653dbcc6783b178071aa76157e315ec8b2c86b06078ca3d02",
};
function kolomOpOmtrek(basis) {
  return {
    ...basis,
    nodes: [...basis.nodes, { id: 30, x: 1250, z: 3000 }, { id: 31, x: 1250, z: 4500 }],
    beams: [{ id: 1, from: 30, to: 31, ...KOLOM }],
    supports: [...basis.supports, { nodeId: 31, type: "xRoller" }],
    pointLoads: [{ nodeId: 31, fz: P, caseId: 1 }],
  };
}
log("\n[4] Bit-identiek aan master 3e35cb2 zonder staafeinde op een openingsrand");
{
  const gevallen = {
    A: kolomOpOmtrek(wand({}, "vierhoeken", null)),
    "B-vierhoeken": kolomOpOmtrek(wand({ edgeLoads: [{ plateId: 1, caseId: 1, openingId: 7, edgeIndex: 2, p: -10, dir: "z" }] }, "vierhoeken")),
    "B-driehoeken": kolomOpOmtrek(wand({ edgeLoads: [{ plateId: 1, caseId: 1, openingId: 7, edgeIndex: 2, p: -10, dir: "z" }] }, "driehoeken")),
    C: {
      ...lModel({ edgeLoads: [{ plateId: 1, caseId: 1, openingId: 3, edgeIndex: 2, p: -10, dir: "z" }] }, "driehoeken"),
    },
  };
  // C: kolom op de omtrekrand 3 (van (4000,2000) naar (2000,2000)) op x = 3250.
  gevallen.C = {
    ...gevallen.C,
    nodes: [...gevallen.C.nodes, { id: 30, x: 3250, z: 2000 }, { id: 31, x: 3250, z: 3000 }],
    beams: [{ id: 1, from: 30, to: 31, ...KOLOM }],
    supports: [...gevallen.C.supports, { nodeId: 31, type: "xRoller" }],
    pointLoads: [{ nodeId: 31, fz: P, caseId: 1 }],
  };
  for (const [naam, mi] of Object.entries(gevallen)) {
    const r = probeer(`${naam}: rekent`, () => eenGeval(mi));
    if (!r) continue;
    const h = vingerafdruk(r);
    if (METING) log(`  METING ${naam}: ${h}`);
    checkTrue(`${naam}: vingerafdruk gelijk aan master`, h === VINGERAFDRUKKEN[naam], h);
  }
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
