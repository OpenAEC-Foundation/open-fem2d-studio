// De kruipcoëfficiënt φ(∞,t₀) volgens NEN-EN 1992-1-1 bijlage B, van
// projectinvoer tot kolomtoets en BGT-stijfheid.
//
// WAT DEZE TEST BEWAAKT
// De formules B.1–B.9 staan in Rust en zijn daar met handberekeningen getest
// (`nen-en-1992-1-1/tests/kruip_bijlage_b.rs`), en de drie wegen in
// `openaec-mcp-server/tests/drie_wegen_kruip.rs`. Hier gaat het om de KETEN in
// de frontend:
//
//   [1] de voorrangsregel: eigen staafwaarde > opgegeven projectwaarde >
//       berekende waarde; alle drie afwezig = niet opgegeven (niet 0);
//   [2] `bepaalKruipPerStaaf` vraagt de kern NIETS als bijlage B uit staat of
//       als het project een φ opgeeft — zo rekent een project zonder de nieuwe
//       invoer bit-identiek als voorheen — en anders één verzoek per
//       betonstaaf met de INGEVOERDE doorsnede (h₀ uit B.6);
//   [3] dezelfde berekende waarde komt in de kolomtoets (`korvenUitStaven`) en
//       in de BGT-stijfheidslus (`betonStavenUitModel`);
//   [4] projectbestand en rekeninstellingen kennen het nieuwe veld;
//   [5] met de ECHTE rekenkern (toetsbrug-binary, als hij er is): de waarde
//       tegen de handberekening.
//
// Draaien met: npx tsx test-kruip-bijlage-b.mjs

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const TOETSBRUG = join(
  REPO, "src-tauri", "target", "release",
  process.platform === "win32" ? "toetsbrug.exe" : "toetsbrug",
);

const {
  kruipcoefficientVanStaaf, kolomMetKruipcoefficient, bepaalKruipPerStaaf,
  kruipWaardenPerStaaf, leesKruipInvoer, STANDAARD_KRUIPINVOER,
} = await import("./src/lib/kruipcoefficient.ts");
const { korvenUitStaven } = await import("./src/stores/checkStore.ts");
const { betonStavenUitModel } = await import("./src/lib/betonStijfheid.ts");
const { rekenInstellingenVersie, REKENINSTELLINGEN_VELDEN } = await import("./src/lib/rekenInstellingen.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");
function ok(naam, cond, extra = "") {
  if (cond) { passed++; log(`  ✓ ${naam}`); }
  else { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}
function eq(naam, gemeten, verwacht) {
  ok(`${naam}: ${JSON.stringify(gemeten)}`,
    JSON.stringify(gemeten) === JSON.stringify(verwacht),
    `verwacht ${JSON.stringify(verwacht)}`);
}
function dicht(naam, gemeten, verwacht, tolRel = 1e-5) {
  const rel = Math.abs(gemeten - verwacht) / Math.abs(verwacht);
  ok(`${naam}: ${gemeten} ≈ ${verwacht}`, rel <= tolRel, `afwijking ${rel.toExponential(2)}`);
}

// ── Het model: twee betonstaven met korf en §5.8-blok, één staalstaaf ──────
const KORF = {
  cover_mm: 30, stirrup_diameter_mm: 8,
  top: { count: 2, diameter_mm: 12 }, bottom: { count: 3, diameter_mm: 16 },
};
const KOLOM = { bracing: "Geschoord", buckling_length: { soort: "Figuur57", geval: "Pendel" } };
const nodes = [
  { id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 12000, z: 0 },
];
const staaf = (id, n1, n2, profile, material, cfg) => ({
  id, from: n1, to: n2, profile, material, checkConfig: cfg,
});
const beams = [
  staaf(1, 1, 2, "300x500", "C30/37", { betonKorf: KORF, betonKolom: { ...KOLOM } }),
  staaf(2, 2, 3, "300x600", "C30/37", { betonKorf: KORF, betonKolom: { ...KOLOM, phi_inf_t0: 1.5 } }),
  staaf(3, 1, 3, "IPE200", "S235", {}),
];

// ═══════════════════════════════════════════════════════════════════════════
log("[1] De voorrangsregel");
// ═══════════════════════════════════════════════════════════════════════════
eq("eigen staafwaarde gaat voor", kruipcoefficientVanStaaf(1.5, 2.0, 2.4), 1.5);
eq("dan de opgegeven projectwaarde", kruipcoefficientVanStaaf(undefined, 2.0, 2.4), 2.0);
eq("een projectwaarde 0 is opgegeven (geen kruip), niet leeg", kruipcoefficientVanStaaf(undefined, 0, 2.4), 0);
eq("dan de berekende waarde", kruipcoefficientVanStaaf(undefined, null, 2.4), 2.4);
eq("alle drie afwezig = niet opgegeven", kruipcoefficientVanStaaf(undefined, null, undefined), undefined);
eq("oude aanroep met twee argumenten ongewijzigd", kruipcoefficientVanStaaf(undefined, 2.0), 2.0);
eq("kolomblok zonder berekende waarde blijft ongemoeid",
  kolomMetKruipcoefficient({ ...KOLOM }, null, undefined), { ...KOLOM });

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] bepaalKruipPerStaaf — wanneer de kern gevraagd wordt");
// ═══════════════════════════════════════════════════════════════════════════
const verzoeken = [];
const nepKern = async (opdracht, inputs) => {
  verzoeken.push({ opdracht, inputs });
  if (inputs.beam_id === 99) throw new Error("RH = 120 %: buiten 0 … 100 %.");
  // Een herkenbaar getal per staaf, zodat [3] kan zien welke waarde waar landt.
  return { beam_id: inputs.beam_id, uitkomst: { phi_inf_t0: 2 + inputs.beam_id / 10 }, deelstappen: [], notes: [] };
};
{
  const uit = await bepaalKruipPerStaaf(beams, null, null, nepKern);
  eq("bijlage B uit: geen enkel verzoek", verzoeken.length, 0);
  eq("en een lege uitkomst", uit.perStaaf.size, 0);
}
{
  const uit = await bepaalKruipPerStaaf(beams, STANDAARD_KRUIPINVOER, 2.0, nepKern);
  eq("projectwaarde opgegeven: geen enkel verzoek (die gaat toch voor)", verzoeken.length, 0);
  eq("en een lege uitkomst", uit.perStaaf.size, 0);
}
{
  const invoer = { rhProcent: 80, t0Dagen: 7, cementklasse: "R" };
  const uit = await bepaalKruipPerStaaf(beams, invoer, null, nepKern, "NL");
  eq("één verzoek per betonstaaf, de staalstaaf niet", verzoeken.map((v) => v.inputs.beam_id), [1, 2]);
  eq("de opdracht", verzoeken[0].opdracht, "concrete_creep_coefficient");
  eq("het verzoek van staaf 1", verzoeken[0].inputs, {
    bijlage: "NL", beam_id: 1, concrete_class: "C30/37",
    relative_humidity_pct: 80, t0_days: 7, cement_class: "R",
    section: { shape: "Rectangle", b_mm: 300, h_mm: 500, b_w_mm: null, h_f_mm: null, flange_at_bottom: false },
  });
  ok("geen h0_mm naast de doorsnede (de kern weigert twee bronnen)", !("h0_mm" in verzoeken[0].inputs));
  eq("waarden per staaf", [...kruipWaardenPerStaaf(uit)], [[1, 2.1], [2, 2.2]]);
  eq("dezelfde waarden uit de lijst van de store", [...kruipWaardenPerStaaf([...uit.perStaaf.values()])], [[1, 2.1], [2, 2.2]]);

  verzoeken.length = 0;
  const fout = await bepaalKruipPerStaaf(
    [staaf(99, 1, 2, "300x500", "C30/37", {})], invoer, null, nepKern,
  );
  eq("een weigering van de kern komt met reden terug", fout.mislukt, [{ beamId: 99, reden: "RH = 120 %: buiten 0 … 100 %." }]);
  eq("en levert geen waarde", fout.perStaaf.size, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[3] Dezelfde waarde in de kolomtoets en in de BGT-stijfheid");
// ═══════════════════════════════════════════════════════════════════════════
{
  const berekend = new Map([[1, 2.1], [2, 2.2]]);
  const zonder = korvenUitStaven(beams, null);
  const leeg = korvenUitStaven(beams, null, new Map());
  eq("zonder berekende waarden bit-identiek aan de oude aanroep", JSON.stringify([...leeg]), JSON.stringify([...zonder]));
  const korven = korvenUitStaven(beams, null, berekend);
  eq("kolomtoets staaf 1: berekende waarde", korven.get(1).kolom.phi_inf_t0, 2.1);
  eq("kolomtoets staaf 2: eigen waarde gaat voor", korven.get(2).kolom.phi_inf_t0, 1.5);
  eq("projectwaarde gaat voor de berekende", korvenUitStaven(beams, 1.8, berekend).get(1).kolom.phi_inf_t0, 1.8);

  const { staven } = betonStavenUitModel({ nodes, beams, berekendePhiPerStaaf: berekend });
  eq("BGT-stijfheid staaf 1: dezelfde berekende waarde", staven.find((s) => s.beamId === 1).phiInfT0, 2.1);
  eq("BGT-stijfheid staaf 2: eigen waarde", staven.find((s) => s.beamId === 2).phiInfT0, 1.5);
  const { staven: oud } = betonStavenUitModel({ nodes, beams });
  eq("BGT-stijfheid zonder berekende waarden: staaf 1 niet opgegeven", oud.find((s) => s.beamId === 1).phiInfT0, undefined);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[4] Projectbestand en rekeninstellingen");
// ═══════════════════════════════════════════════════════════════════════════
{
  eq("geldige invoer gelezen", leesKruipInvoer({ rhProcent: 50, t0Dagen: 28, cementklasse: "N" }),
    { rhProcent: 50, t0Dagen: 28, cementklasse: "N" });
  eq("ontbrekend veld = bijlage B uit", leesKruipInvoer(undefined), null);
  eq("onbekende cementklasse = uit", leesKruipInvoer({ rhProcent: 50, t0Dagen: 28, cementklasse: "X" }), null);
  eq("tekst in plaats van getal = uit", leesKruipInvoer({ rhProcent: "50", t0Dagen: 28, cementklasse: "N" }), null);
  ok("rekeninstellingen kennen betonKruipInvoer", REKENINSTELLINGEN_VELDEN.includes("betonKruipInvoer"));
  const basis = Object.fromEntries(REKENINSTELLINGEN_VELDEN.map((k) => [k, null]));
  ok("een andere invoer geeft een andere versie (resultaten vervallen)",
    rekenInstellingenVersie({ ...basis, betonKruipInvoer: STANDAARD_KRUIPINVOER }) !==
    rekenInstellingenVersie({ ...basis, betonKruipInvoer: { ...STANDAARD_KRUIPINVOER, rhProcent: 80 } }));
  const projectFile = readFileSync(join(HIER, "src/io/projectFile.ts"), "utf8");
  ok("projectbestand kent het topveld", projectFile.includes('"betonKruipInvoer"'));
  const app = readFileSync(join(HIER, "src/App.tsx"), "utf8");
  ok("App slaat het veld op en leest het terug",
    app.includes("betonKruipInvoer: fem.betonKruipInvoer") && app.includes("betonKruipInvoer: parsed.betonKruipInvoer"));
  ok("App geeft de invoer aan de toetsing", app.includes("kruipInvoer: fem.betonKruipInvoer"));
  ok("App vult de stijfheidslus met de berekende waarden",
    app.includes("berekendePhiPerStaaf: kruipWaardenPerStaaf(kruipBerekening)"));
  const store = readFileSync(join(HIER, "src/stores/checkStore.ts"), "utf8");
  ok("toetsing rekent met dezelfde functie", store.includes("bepaalKruipPerStaaf(") &&
    store.includes("korvenUitStaven(data.beams, data.standaardPhiInfT0, kruipWaardenPerStaaf(kruip))"));
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[5] Met de ECHTE rekenkern");
// ═══════════════════════════════════════════════════════════════════════════
//
// HANDBEREKENING, staaf 1: rechthoek 300 × 500, C30/37 (f_cm = 38 MPa > 35),
// RH 50 %, t₀ = 28 d, cement N.
//
//   A_c = 150 000 mm², u = 1600 mm, h₀ = 2·150 000/1600 = 187,5 mm   (B.6)
//   α₁ = (35/38)^0,7 = 0,944059; α₂ = (35/38)^0,2 = 0,983687          (B.8c)
//   ∛187,5 = 5,723571; (1 − 0,50)/(0,1·5,723571) = 0,873580
//   φ_RH = [1 + 0,873580·0,944059]·0,983687 = 1,794945                (B.3b)
//   β(f_cm) = 16,8/√38 = 2,725320                                     (B.4)
//   t₀ = 28 (α = 0); β(t₀) = 1/(0,1 + 28^0,20) = 0,488450             (B.9), (B.5)
//   φ(∞,t₀) = 1,794945·2,725320·0,488450 = 2,389397                   (B.2)
//
// Staaf 2, 300 × 600: h₀ = 2·180 000/1800 = 200 mm; ∛200 = 5,848035;
//   0,5/0,5848035 = 0,854988; φ_RH = [1 + 0,854988·0,944059]·0,983687 = 1,777679;
//   φ(∞,t₀) = 1,777679·2,725320·0,488450 = 2,366413.
if (!existsSync(TOETSBRUG)) {
  overgeslagen++;
  log(`  (overgeslagen: ${TOETSBRUG} ontbreekt — bouw hem met`);
  log("   cargo build --release -p toetsbrug  vanuit src-tauri)");
} else {
  const kern = (opdracht, inputs) => new Promise((res, rej) => {
    const kind = spawn(TOETSBRUG, [], { stdio: ["pipe", "pipe", "pipe"] });
    let uit = "", fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("error", rej);
    kind.on("close", () => {
      let j;
      try { j = JSON.parse(uit); } catch { return rej(new Error(`kern gaf geen JSON: ${uit || fout}`)); }
      if (j && j.fout) return rej(new Error(j.fout));
      res(j);
    });
    kind.stdin.end(JSON.stringify({ opdracht, inputs }));
  });
  const invoer = { rhProcent: 50, t0Dagen: 28, cementklasse: "N" };
  const uit = await bepaalKruipPerStaaf(beams, invoer, null, kern);
  eq("geen weigeringen", uit.mislukt, []);
  const a1 = uit.perStaaf.get(1);
  dicht("staaf 1: h₀", a1.uitkomst.h0_mm, 187.5, 1e-12);
  dicht("staaf 1: φ_RH (B.3b)", a1.uitkomst.phi_rh, 1.794945);
  dicht("staaf 1: φ(∞,t₀)", a1.uitkomst.phi_inf_t0, 2.389397);
  dicht("staaf 2: h₀", uit.perStaaf.get(2).uitkomst.h0_mm, 200, 1e-12);
  dicht("staaf 2: φ(∞,t₀)", uit.perStaaf.get(2).uitkomst.phi_inf_t0, 2.366413);
  ok("de afleiding eindigt met φ(∞,t₀)", a1.deelstappen.at(-1).id === "kruip_phi_0" &&
    a1.deelstappen.at(-1).value === a1.uitkomst.phi_inf_t0);
  const korven = korvenUitStaven(beams, null, kruipWaardenPerStaaf(uit));
  eq("en die waarde staat in het kolomblok van staaf 1", korven.get(1).kolom.phi_inf_t0, a1.uitkomst.phi_inf_t0);

  let weigering = null;
  try { await kern("concrete_creep_coefficient", { concrete_class: "C30/37", relative_humidity_pct: 120, t0_days: 28, cement_class: "N", h0_mm: 150 }); }
  catch (e) { weigering = e.message; }
  ok("RH = 120 % wordt geweigerd met reden", weigering !== null && weigering.includes("RH"), String(weigering));
}

log(`\n${passed} geslaagd, ${failed} mislukt${overgeslagen ? `, ${overgeslagen} blok(ken) overgeslagen` : ""}`);
process.exit(failed > 0 ? 1 : 0);
