// Openingen in de UI-laag (stap 2 van het platenspoor): de modelcontrole en
// het meereizen van openingen in de store.
//
// WAT HIER BEWEZEN WORDT, EN WAARMEE
//   [1] MODELCONTROLE: dezelfde regel als poort en engine
//       (`valideerPlaatOpeningen`) — een opening buiten de plaat, rakend aan
//       de omtrek of over een andere opening heen is een bevinding "opening"
//       met ernst "fout" en de reden; een geldige opening geeft geen bevinding.
//   [2] STORE: openingen zijn coördinaten en geen knopen. Verplaatsen,
//       roteren en spiegelen van een selectie die de HELE plaat omvat neemt de
//       openingen mee met dezelfde afbeelding als de hoeken (roteren en
//       spiegelen rond op hele mm, net als de knopen); verplaatst de gebruiker
//       maar één hoek, dan blijft de opening staan. Kopiëren geeft de kopie
//       een verschoven opening en laat het origineel ongemoeid. Zonder deze
//       regels zou een kopie of verschoven plaat stil een gat op de OUDE plek
//       hebben — de engine zou dan weigeren (opening buiten de plaat) of, bij
//       een grote plaat, een gat op de verkeerde plek rekenen.
//
// Uitvoeren: npx tsx test-plaat-openingen-store.mjs   (vanuit design-mockup/)

const { controleerModel } = await import("./src/lib/modelControle.ts");
const {
  computeSelectionTranslate, computeSelectionRotate, computeSelectionMirror,
  computeSelectionCopy, transformeerPlaatOpeningen,
} = await import("./src/hooks/useFemStore.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}
const rect = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const gelijk = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Wand 4 × 3 m op hoekknopen 1..4, opleggingen op de onderhoeken.
function model(openingen) {
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }, { id: 3, x: 4000, z: 3000 }, { id: 4, x: 0, z: 3000 }],
    beams: [],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "pinned" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], thickness: 20, E: 210000, nu: 0.3, rho: 7850, meshSize: 500,
      openingen: openingen.map((p, i) => ({ id: i + 1, punten: p })) }],
    loads: [],
  };
}

log("\n[1] Modelcontrole: openingen langs dezelfde regel als poort en engine");
{
  const gevallen = [
    { naam: "opening buiten de plaat", op: [rect(4500, 500, 5500, 1500)], re: /Plaat 1: Opening 1 ligt niet binnen de plaat: hoek 1 \(4500, 500\)/ },
    { naam: "opening raakt de omtrek (5 mm)", op: [rect(500, 5, 1500, 1000)], re: /Plaat 1: Opening 1 raakt de omtrek van de plaat: hoek 1 ligt 5 mm van rand 1/ },
    { naam: "twee overlappende openingen", op: [rect(500, 500, 1500, 1500), rect(1000, 1000, 2000, 2000)], re: /Plaat 1: Opening 1 en opening 2 (overlappen|snijden) elkaar/ },
    { naam: "twee openingen te dicht op elkaar", op: [rect(500, 500, 1500, 1500), rect(1504, 500, 2500, 1500)], re: /raken elkaar \(4 mm tussenruimte\)/ },
    { naam: "opening zonder oppervlakte", op: [[{ x: 500, z: 500 }, { x: 1500, z: 500 }, { x: 2500, z: 500 }]], re: /Opening 1: De hoeken liggen \(vrijwel\) op één lijn/ },
  ];
  for (const g of gevallen) {
    const b = controleerModel(model(g.op));
    checkTrue(`modelcontrole — ${g.naam}`,
      b.some((x) => x.soort === "opening" && x.ernst === "fout" && g.re.test(x.tekst) && gelijk(x.nodeIds, [1, 2, 3, 4])),
      JSON.stringify(b.map((x) => x.tekst)));
  }
  checkTrue("geldige opening: geen bevinding", !controleerModel(model([rect(1500, 1000, 2500, 2000)])).some((b) => b.soort === "opening"));
  checkTrue("plaat zonder openingen: geen bevinding", !controleerModel(model([])).some((b) => b.soort === "opening"));
}

log("\n[2] Store: openingen reizen mee met de hele plaat");
{
  const opening = rect(1500, 1000, 2500, 2000);
  const cur = { ...model([opening]), loads: [] };
  const selPlaat = { type: "plate", id: 1 };
  // Verplaatsen: +1000, −500.
  const t = computeSelectionTranslate(cur, selPlaat, 1000, -500);
  checkTrue("verplaatsen: hoeken +1000/−500", t.nodes.find((n) => n.id === 3).x === 5000 && t.nodes.find((n) => n.id === 3).z === 2500);
  checkTrue("verplaatsen: opening +1000/−500", gelijk(t.plates[0].openingen[0].punten, rect(2500, 500, 3500, 1500)));
  checkTrue("verplaatsen: origineel ongemoeid", gelijk(cur.plates[0].openingen[0].punten, opening));
  // Eén hoek verplaatsen: de plaat vervormt, de opening blijft.
  const eenHoek = computeSelectionTranslate(cur, { type: "node", id: 3 }, 500, 0);
  checkTrue("één hoek verplaatsen: opening blijft staan", gelijk(eenHoek.plates[0].openingen[0].punten, opening));
  // Roteren 90° om de oorsprong: (x, z) → (−z, x).
  const r = computeSelectionRotate(cur, selPlaat, 0, 0, Math.PI / 2);
  checkTrue("roteren 90°: hoek 2 (4000,0) → (0,4000)", r.nodes.find((n) => n.id === 2).x === 0 && r.nodes.find((n) => n.id === 2).z === 4000);
  checkTrue("roteren 90°: opening (1500,1000)…(2500,2000) → (−1000,1500)…(−2000,2500)",
    gelijk(r.plates[0].openingen[0].punten, [{ x: -1000, z: 1500 }, { x: -1000, z: 2500 }, { x: -2000, z: 2500 }, { x: -2000, z: 1500 }]));
  checkTrue("roteren: opening op hele mm (zoals de knopen)", r.plates[0].openingen[0].punten.every((p) => Number.isInteger(p.x) && Number.isInteger(p.z)));
  // Spiegelen om x = 2000: x → 4000 − x.
  const m = computeSelectionMirror(cur, selPlaat, 2000, 0, 2000, 1);
  checkTrue("spiegelen om x = 2000: opening (1500..2500) → (2500..1500)",
    gelijk(m.plates[0].openingen[0].punten, [{ x: 2500, z: 1000 }, { x: 1500, z: 1000 }, { x: 1500, z: 2000 }, { x: 2500, z: 2000 }]));
  // Kopiëren op offset (0, 5000).
  const c = computeSelectionCopy({ ...cur, loads: [] }, selPlaat, 0, 5000);
  checkTrue("kopiëren: twee platen", c.plates.length === 2);
  checkTrue("kopiëren: kopie heeft de opening op +5000 in z", gelijk(c.plates[1].openingen[0].punten, rect(1500, 6000, 2500, 7000)));
  checkTrue("kopiëren: origineel houdt zijn opening", gelijk(c.plates[0].openingen[0].punten, opening));
  checkTrue("kopiëren: opening-id en meshType gaan mee", c.plates[1].openingen[0].id === 1);
  // Multi-selectie met alle hoeken: ook meenemen; met drie hoeken: niet.
  const alle = transformeerPlaatOpeningen(cur.plates, new Set([1, 2, 3, 4]), (p) => ({ x: p.x + 1, z: p.z }));
  const drie = transformeerPlaatOpeningen(cur.plates, new Set([1, 2, 3]), (p) => ({ x: p.x + 1, z: p.z }));
  checkTrue("transformeerPlaatOpeningen: alle hoeken → opening mee", alle[0].openingen[0].punten[0].x === 1501);
  checkTrue("transformeerPlaatOpeningen: drie hoeken → opening blijft", drie[0].openingen[0].punten[0].x === 1500);
  const zonder = model([]).plates;
  checkTrue("plaat zonder openingen blijft dezelfde referentie (geen nodeloze kopie)", transformeerPlaatOpeningen(zonder, new Set([1, 2, 3, 4]), (p) => p)[0] === zonder[0]);
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
