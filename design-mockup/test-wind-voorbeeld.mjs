// Windgenerator — het voorbeeld in het venster hoort bij de invoer op het
// scherm (issue #29).
//
// WAT HIER MISGING
//  Het venster rekende zijn voorbeeld tijdens de render uit (useMemo op de
//  instellingen), maar de store las de instellingen uit een ref die pas NA de
//  render in een effect werd bijgewerkt. Elke klik toonde daardoor de
//  uitkomst van de VORIGE invoer: na "Lessenaarsdak" stond de fout van het
//  zadeldak er nog, en die hield "Genereren" uitgeschakeld.
//
// WAT DEZE TEST VASTLEGT
//  [1] De afleiding `windVoorbeeld(model, instellingen)` volgt de reproductie
//      uit het issue stap voor stap: gebouw → vrijstaand dak (lessenaar) →
//      zadeldak (fout, Genereren uit) → lessenaarsdak (geen fout, Genereren
//      aan). Elke stap hoort bij zijn EIGEN invoer, ook als de vorige stap een
//      fout gaf.
//  [2] Het voorbeeld is gelijk aan wat Genereren zelf uitrekent
//      (`genereerWindbelasting` met dezelfde invoer), dus voorbeeld en
//      gegenereerde lasten kunnen niet uit elkaar lopen.
//  [3] De aansluiting in de bron: het venster geeft zijn instellingen mee aan
//      `wind.voorbeeld(i)` en laat de knop afhangen van `kanGenereren`; de
//      store leest voor het voorbeeld niet uit `instRef`.
//
// Uitvoeren: npx tsx test-wind-voorbeeld.mjs   (vanuit design-mockup/)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const { windVoorbeeld } = await import("./src/lib/wind/windVoorbeeld.ts");
const { genereerWindbelasting, STANDAARD_WIND_INSTELLINGEN } = await import("./src/lib/wind/windGenerator.ts");

let passed = 0, failed = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(naam, voorwaarde, detail = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}`); }
  else            { failed++; log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

// Portaal met één horizontale dakstaaf, zoals het startmodel: 6 m breed, 3 m hoog.
const model = {
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 0, z: 3000 }, { id: 4, x: 6000, z: 3000 }],
  beams: [{ id: 1, from: 1, to: 3 }, { id: 2, from: 2, to: 4 }, { id: 3, from: 3, to: 4 }],
  loadCases: [{ id: 1, name: "Eigen gewicht", type: "dead" }],
};

const isZadelFout = (m) => m.tekst.includes("zadeldak (tabel 7.7)");
const isVrijstaandGeval = (g) => g.sleutel.startsWith("luifel:");

// ─────────────────────────────────────────────────────────────────────────
log("\n[1] De reproductie uit het issue, stap voor stap");
{
  const stap0 = { ...STANDAARD_WIND_INSTELLINGEN };
  const v0 = windVoorbeeld(model, stap0);
  check("gebouw: geen fout, Genereren aan", v0.fouten.length === 0 && v0.kanGenereren,
    v0.fouten.map((m) => m.tekst).join(" | "));
  check("gebouw: gebouwgevallen (geen vrijstaand-dakgeval)",
    v0.resultaat.gevallen.length > 0 && !v0.resultaat.gevallen.some(isVrijstaandGeval));

  const stap1 = { ...stap0, vorm: "vrijstaandDak" };
  const v1 = windVoorbeeld(model, stap1);
  check("vrijstaand dak: alleen vrijstaand-dakgevallen, geen gebouwgevallen",
    v1.resultaat.gevallen.length > 0 && v1.resultaat.gevallen.every(isVrijstaandGeval),
    v1.resultaat.gevallen.map((g) => g.sleutel).join(", "));
  check("vrijstaand dak: geen melding over inwendige druk (§7.2.9)",
    !v1.resultaat.meldingen.some((m) => m.tekst.includes("7.2.9")));

  const stap2 = { ...stap1, vrijstaandDakvorm: "zadel" };
  const v2 = windVoorbeeld(model, stap2);
  check("zadeldak op één dakvlak: de zadeldakfout", v2.fouten.some(isZadelFout),
    v2.fouten.map((m) => m.tekst).join(" | "));
  check("zadeldak: Genereren uit", v2.kanGenereren === false);

  // Dit is de stap die in het venster misging: de invoer is weer geldig.
  const stap3 = { ...stap2, vrijstaandDakvorm: "lessenaar" };
  const v3 = windVoorbeeld(model, stap3);
  check("lessenaarsdak na de fout: geen fout meer", v3.fouten.length === 0,
    v3.fouten.map((m) => m.tekst).join(" | "));
  check("lessenaarsdak na de fout: Genereren aan", v3.kanGenereren === true);
  check("lessenaarsdak na de fout: dezelfde uitkomst als stap 1 (zelfde invoer)",
    JSON.stringify(v3.resultaat) === JSON.stringify(v1.resultaat));

  // En terug: de fout komt direct terug, niet één klik later.
  const v4 = windVoorbeeld(model, stap2);
  check("weer zadeldak: de fout is er direct", v4.fouten.some(isZadelFout) && !v4.kanGenereren);

  // Fouten en overige meldingen samen zijn precies de meldingen.
  for (const [naam, v] of [["gebouw", v0], ["lessenaar", v1], ["zadel", v2]]) {
    check(`${naam}: fouten + overige = alle meldingen`,
      v.fouten.length + v.overige.length === v.resultaat.meldingen.length
      && v.fouten.every((m) => m.niveau === "fout") && v.overige.every((m) => m.niveau !== "fout"));
    check(`${naam}: kanGenereren volgt ok van de generator`, v.kanGenereren === v.resultaat.ok);
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[2] Voorbeeld = wat Genereren uitrekent");
{
  for (const inst of [
    { ...STANDAARD_WIND_INSTELLINGEN },
    { ...STANDAARD_WIND_INSTELLINGEN, vorm: "vrijstaandDak" },
    { ...STANDAARD_WIND_INSTELLINGEN, vorm: "vrijstaandDak", vrijstaandDakvorm: "zadel" },
  ]) {
    const v = windVoorbeeld(model, inst);
    const g = genereerWindbelasting(model, inst);
    check(`${inst.vorm}/${inst.vrijstaandDakvorm}: voorbeeld identiek aan generatie`,
      JSON.stringify(v.resultaat) === JSON.stringify(g));
  }
}

// ─────────────────────────────────────────────────────────────────────────
log("\n[3] Aansluiting in de bron");
{
  const dialoog = readFileSync(join(HIER, "src", "lib", "wind", "WindGeneratorDialog.tsx"), "utf8");
  const store = readFileSync(join(HIER, "src", "stores", "windStore.ts"), "utf8");
  check("venster geeft de instellingen mee aan wind.voorbeeld(i)", /wind\.voorbeeld\(i\)/.test(dialoog));
  check("venster roept wind.voorbeeld() niet meer zonder invoer aan", !/wind\.voorbeeld\(\s*\)/.test(dialoog));
  check("knop Genereren hangt af van kanGenereren", /disabled=\{!vb\?\.kanGenereren\}/.test(dialoog));
  const voorbeeldBlok = store.match(/const voorbeeld = useCallback\(([\s\S]*?)\}, \[\]\);/);
  check("store: voorbeeld neemt de instellingen als argument", !!voorbeeldBlok && /\(inst: WindInstellingen\)/.test(voorbeeldBlok[1]));
  check("store: voorbeeld leest niet uit instRef", !!voorbeeldBlok && !voorbeeldBlok[1].includes("instRef"));
}

log(`\n${passed} geslaagd, ${failed} gefaald`);
process.exit(failed === 0 ? 0 : 1);
