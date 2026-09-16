// Staafeinde op de rand van een OPENING — de modelcontrole van het canvas
// (lib/modelControle). Valt buiten de barrel van de sidecarbundel en draait
// daarom op de bron; de rekenkant (koppeling, evenwicht, weigering in de
// engine, MCP-droogloop, bit-identiek) staat in test-plaat-opening-staafeinde.mjs.
//
// WAT HIER BEWEZEN WORDT
//   [1] GEEN VALS VRIJ UITEINDE: een kolomvoet op de rand van een opening hangt
//       aan de plaat (de engine koppelt hem); de waarschuwing "vrij uiteinde"
//       hoort dan niet te komen — net zoals op de omtrek. Een kolomvoet midden
//       in de opening krijgt hem wél.
//   [2] BIJNA OP DE RAND (STAAFEINDE_BIJ_RAND_MM, femTypes): een vrij
//       staafeinde 5 mm van een openingsrand of 4 mm van de omtrek, BUITEN het
//       plaatmateriaal, is een FOUT met rand en afstand in de tekst — dezelfde
//       tekst als de engine; de vrij-uiteinde-waarschuwing verdwijnt ervoor.
//       Grensgevallen: 1 mm (op de rand) en 50 mm (buiten de regel) geven
//       niets; 49 mm wel.
//   [3] WAARSCHUWING, GEEN FOUT, waar de engine het niet zeker weigert: een
//       knoop die ook een oplegging draagt, en een vrij einde BINNEN het
//       plaatmateriaal (dat kan op een rekenknoop van een fijn net vallen).
//   [4] Model zonder platen: de regel zwijgt.
//
// Uitvoeren: npx tsx test-plaat-opening-staafeinde-controle.mjs   (vanuit design-mockup/)

const { controleerModel, zoekStaafeindenBijPlaatrand } = await import("./src/lib/modelControle.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function checkTrue(name, ok, detail = "") {
  if (ok) { passed++; log(`  ✓ ${name}${detail ? `: ${detail}` : ""}`); }
  else    { failed++; log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`); }
}

const rect = (x0, z0, x1, z1) =>
  [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
// Wand 4 × 3 m, opening 7 van (1500,1000) tot (2500,2000). Rand 1 van de
// opening is de onderrand (1500,1000) → (2500,1000); rand 3 van de omtrek is
// de bovenrand (4000,3000) → (0,3000).
const OPENING = rect(1500, 1000, 2500, 2000);
function model(voet, kop = { x: voet.x, z: 1800 }, extra = {}) {
  return {
    nodes: [
      { id: 1, x: 0, z: 0 }, { id: 2, x: 4000, z: 0 }, { id: 3, x: 4000, z: 3000 }, { id: 4, x: 0, z: 3000 },
      { id: 30, ...voet }, { id: 31, ...kop },
    ],
    beams: [{ id: 1, from: 30, to: 31 }],
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 31, type: "xRoller" }],
    plates: [{ id: 1, nodeIds: [1, 2, 3, 4], openingen: [{ id: 7, punten: OPENING }] }],
    loads: [],
    ...extra,
  };
}
const van = (bev, soort) => bev.filter((b) => b.soort === soort && b.nodeIds.includes(30));

log("\n[1] Geen vals vrij uiteinde op een openingsrand");
{
  const bev = controleerModel(model({ x: 1625, z: 1000 }));
  checkTrue("kolomvoet op de openingsrand: geen vrij uiteinde", van(bev, "vrijUiteinde").length === 0, JSON.stringify(bev));
  checkTrue("kolomvoet op de openingsrand: geen bijna-rand-melding", van(bev, "staafeindeBijPlaatrand").length === 0, "");
  const hoek = controleerModel(model({ x: 1500, z: 1000 }));
  checkTrue("kolomvoet op de openingshoek: geen vrij uiteinde", van(hoek, "vrijUiteinde").length === 0, "");
  const midden = controleerModel(model({ x: 2000, z: 1500 }));
  checkTrue("kolomvoet midden in de opening (500 mm van elke rand): wél vrij uiteinde",
    van(midden, "vrijUiteinde").length === 1 && van(midden, "staafeindeBijPlaatrand").length === 0, "");
}

log("\n[2] Bijna op de rand: fout, met rand en afstand");
{
  const bev = controleerModel(model({ x: 1625, z: 1005 }));
  const f = van(bev, "staafeindeBijPlaatrand");
  checkTrue("5 mm boven de onderrand (in de opening): één fout",
    f.length === 1 && f[0].ernst === "fout", JSON.stringify(f));
  checkTrue("tekst noemt plaat, knoop, afstand en rand (gelijk aan de engine)",
    /^Plaat 1: het vrije staafeinde op knoop 30 ligt 5 mm van rand 1 van opening 7\./.test(f[0]?.tekst ?? ""), f[0]?.tekst ?? "");
  checkTrue("de vrij-uiteinde-waarschuwing verdwijnt ervoor", van(bev, "vrijUiteinde").length === 0, "");
  // 2,5 mm links van de rechterrand van de opening (x = 2500): rand 2.
  const komma = van(controleerModel(model({ x: 2497.5, z: 1500 }, { x: 2497.5, z: 1900 })), "staafeindeBijPlaatrand");
  checkTrue("2,5 mm van rand 2: afstand met komma",
    /ligt 2,5 mm van rand 2 van opening 7/.test(komma[0]?.tekst ?? ""), komma[0]?.tekst ?? "");
  // Omtrek: voet 4 mm BOVEN de bovenrand (buiten de plaat).
  const omtrek = van(controleerModel(model({ x: 1250, z: 3004 }, { x: 1250, z: 4000 })), "staafeindeBijPlaatrand");
  checkTrue("omtrek: 4 mm boven de bovenrand is een fout",
    omtrek.length === 1 && omtrek[0].ernst === "fout" && /ligt 4 mm van rand 3 van de omtrek/.test(omtrek[0].tekst),
    omtrek[0]?.tekst ?? "");
  // Grenzen. 1 mm: binnen de koppeltolerantie (op de rand). 49 mm: nog in de
  // regel. 50 mm: de grens is exclusief, dus niet meer.
  const bij = (dz) => van(zoekStaafeindenBijPlaatrand(model({ x: 1625, z: 1000 + dz })), "staafeindeBijPlaatrand").length;
  checkTrue("1 mm: geen melding (gekoppeld)", bij(1) === 0, "");
  checkTrue("49 mm: melding", bij(49) === 1, "");
  checkTrue("50 mm: geen melding (grens exclusief)", bij(50) === 0, "");
}

log("\n[3] Waarschuwing waar de engine niet zeker weigert");
{
  // De voet draagt zelf een oplegging: bewust naast de plaat is denkbaar.
  const gesteund = van(controleerModel(model({ x: 1625, z: 1005 }, undefined, {
    supports: [{ nodeId: 1, type: "pinned" }, { nodeId: 2, type: "zRoller" }, { nodeId: 30, type: "pinned" }],
  })), "staafeindeBijPlaatrand");
  checkTrue("gesteunde knoop 5 mm van de rand: waarschuwing",
    gesteund.length === 1 && gesteund[0].ernst === "waarschuwing", gesteund[0]?.tekst ?? "");
  // Vrij einde 5 mm ONDER de onderrand van de opening: in het materiaal.
  const inMateriaal = van(controleerModel(model({ x: 1625, z: 995 }, { x: 1625, z: 500 })), "staafeindeBijPlaatrand");
  checkTrue("vrij einde in het plaatmateriaal, 5 mm van de rand: waarschuwing",
    inMateriaal.length === 1 && inMateriaal[0].ernst === "waarschuwing", inMateriaal[0]?.tekst ?? "");
}

log("\n[4] Zonder platen zwijgt de regel");
{
  const m = model({ x: 1625, z: 1005 });
  checkTrue("geen platen: geen bijna-rand-melding",
    zoekStaafeindenBijPlaatrand({ ...m, plates: [] }).length === 0, "");
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed > 0 ? 1 : 0);
