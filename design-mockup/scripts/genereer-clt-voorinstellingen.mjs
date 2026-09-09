#!/usr/bin/env node
/**
 * genereer-clt-voorinstellingen.mjs — genereert de TypeScript-lijst met
 * standaardopbouwen van kruislaaghout uit de Rust-kern (bron van waarheid):
 *
 *   bron : ../src-tauri/crates/nen-en-1995-1-1/src/clt.rs  (fn clt_presets)
 *   doel : src/lib/cltVoorinstellingen.generated.ts
 *
 * Draaien vanuit design-mockup/:  node scripts/genereer-clt-voorinstellingen.mjs
 *
 * WAAROM DEZE KANT OP
 * -------------------
 * De opbouwen stonden op twee plaatsen: hier in TypeScript en in de kern, waar
 * `clt_presets()` alle drie de wegen bedient (het Tauri-command
 * `list_clt_presets`, de toetsbrug en de MCP-server). Ze werden met de hand
 * gelijk gehouden en niets ving het uiteenlopen op. De kern kan niet wijken —
 * daar hangen de drie wegen aan — dus is de kern de bron en is de TS-lijst
 * voortaan afgeleid.
 *
 * WAAROM UIT DE BRONTEKST EN NIET UIT EEN DRAAIENDE KERN
 * -----------------------------------------------------
 * De profielkiezer moet ook werken zonder gebouwde kern (in de browser op de
 * dev-server), dus de lijst moet als gewone TS-module beschikbaar zijn. Zou de
 * generator de kern-binary aanroepen, dan kon niemand meer genereren of toetsen
 * zonder eerst een cargo-build; nu is een tekstbestand genoeg en draait de
 * driftcontrole (`test-clt-voorinstellingen.mjs`) overal.
 *
 * De lezer hieronder is met opzet STRENG: hij eist de exacte vorm van
 * `clt_presets()` zoals die nu is. Verandert die vorm, dan werpt hij een fout
 * in plaats van stilletjes minder op te halen — een luide fout is hier het
 * enige veilige gedrag, want een halve lijst zou als "geen drift" doorgaan.
 *
 * Geen dependencies; alleen Node-ingebouwde modules.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));

/** De Rust-bron met `fn clt_presets()`. */
export const KERN_BRON_PAD = join(
  hier, "..", "..",
  "src-tauri", "crates", "nen-en-1995-1-1", "src", "clt.rs",
);

/** Het gegenereerde TypeScript-bestand. */
export const DOEL_PAD = join(hier, "..", "src", "lib", "cltVoorinstellingen.generated.ts");

/**
 * De closure die in `clt_presets()` elke voorinstelling maakt. Staat hier
 * letterlijk (op witruimte na) zodat de generator omvalt zodra de kern de
 * betekenis van de velden verandert — met name `height_mm = Σ t_i`, want die
 * som rekenen we hieronder zelf na.
 */
const VERWACHTE_MAAK_CLOSURE = [
  "let maak = |name: &str, t: &[f64]| CltPreset {",
  "name: name.to_string(),",
  "thicknesses_mm: t.to_vec(),",
  "height_mm: t.iter().sum(),",
  "};",
].join(" ");

/** Witruimte platslaan, zodat de vormvergelijking niet over inspringing valt. */
function plat(tekst) {
  return tekst.replace(/\s+/g, " ").trim();
}

/**
 * Leest de voorinstellingen uit de Rust-brontekst.
 * Levert `[{ name, thicknesses_mm, height_mm }]` in bronvolgorde.
 * Werpt bij elke afwijking van de verwachte vorm.
 */
export function leesKernVoorinstellingen(bronPad = KERN_BRON_PAD) {
  const bron = readFileSync(bronPad, "utf8").replace(/\r\n/g, "\n");

  const fn = /\npub fn clt_presets\(\) -> Vec<CltPreset> \{\n([\s\S]*?)\n\}\n/.exec(bron);
  if (!fn) {
    throw new Error(
      `Geen 'pub fn clt_presets() -> Vec<CltPreset>' gevonden in ${bronPad}. ` +
      "Is de kern hernoemd of van vorm veranderd? Werk deze generator bij.",
    );
  }
  const body = fn[1];

  const closure = /let maak = [\s\S]*?\n\s*\};/.exec(body);
  if (!closure || plat(closure[0]) !== VERWACHTE_MAAK_CLOSURE) {
    throw new Error(
      "De 'maak'-closure in clt_presets() heeft niet meer de verwachte vorm " +
      `(verwacht: ${VERWACHTE_MAAK_CLOSURE}). Werk deze generator bij en ` +
      "controleer of height_mm nog de som van de laagdikten is.",
    );
  }

  const vec = /vec!\[\n([\s\S]*?)\n\s*\]/.exec(body.slice(closure.index + closure[0].length));
  if (!vec) {
    throw new Error("Geen 'vec![…]' met de voorinstellingen gevonden in clt_presets().");
  }

  const presets = [];
  for (const regel of vec[1].split("\n")) {
    const r = regel.trim();
    // Lege regels en Rust-commentaar mogen; iets anders dan een maak-regel
    // niet — anders zou een op een andere manier gebouwde voorinstelling
    // ongemerkt buiten de gegenereerde lijst vallen.
    if (r === "" || r.startsWith("//")) continue;
    const m = /^maak\("([^"]+)",\s*&\[([^\]]*)\]\),$/.exec(r);
    if (!m) {
      throw new Error(`Onverwachte regel in de vec! van clt_presets(): ${JSON.stringify(r)}`);
    }
    const diktes = m[2].split(",").map((s) => s.trim()).filter((s) => s !== "");
    if (diktes.length === 0) {
      throw new Error(`Voorinstelling "${m[1]}" heeft geen laagdikten.`);
    }
    const thicknesses_mm = diktes.map((s) => {
      if (!/^\d+(?:\.\d+)?$/.test(s)) {
        throw new Error(`Geen geldige laagdikte bij "${m[1]}": ${JSON.stringify(s)}`);
      }
      return Number(s);
    });
    // height_mm rekenen we zelf, precies zoals de closure het doet.
    const height_mm = thicknesses_mm.reduce((a, b) => a + b, 0);
    presets.push({ name: m[1], thicknesses_mm, height_mm });
  }

  if (presets.length === 0) {
    throw new Error("clt_presets() leverde geen voorinstellingen op — bron is stuk.");
  }
  const namen = new Set(presets.map((p) => p.name));
  if (namen.size !== presets.length) {
    throw new Error("Dubbele naam in clt_presets(); namen moeten uniek zijn (de kiezer zoekt op naam).");
  }
  return presets;
}

/** Getal → TS-literal, zonder overbodige ",0" (20.0 → 20). */
function num(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Geen geldig getal: ${JSON.stringify(v)}`);
  }
  return String(v);
}

/** Bouwt de volledige inhoud van het doelbestand. */
export function bouwTsBestand(presets) {
  let uit = `/**
 * Standaardopbouwen van kruislaaghout (CLT) voor de profielkiezer.
 *
 * GEGENEREERD uit src-tauri/crates/nen-en-1995-1-1/src/clt.rs (fn clt_presets) —
 * de bron van waarheid die ook het Tauri-command \`list_clt_presets\`, de
 * toetsbrug en de MCP-server bedienen. Niet met de hand bijwerken; opnieuw
 * genereren met: node scripts/genereer-clt-voorinstellingen.mjs
 *
 * Dit zijn VOORINSTELLINGEN met ronde lameldikten in symmetrische opbouw —
 * geen normwaarden en geen productmaten. De gebruiker past ze vrij aan.
 *
 * \`test-clt-voorinstellingen.mjs\` houdt deze lijst tegen de kern aan en valt
 * om zodra er één naam, laagdikte of totale hoogte uiteenloopt.
 */
import type { CltPreset } from "./types/timber/CltPreset";

export const CLT_VOORINSTELLINGEN: readonly CltPreset[] = [
`;
  for (const p of presets) {
    const t = p.thicknesses_mm.map(num).join(", ");
    uit += `  { name: ${JSON.stringify(p.name)}, thicknesses_mm: [${t}], height_mm: ${num(p.height_mm)} },\n`;
  }
  uit += `];\n`;
  return uit;
}

// Alleen schrijven wanneer dit script zelf gestart wordt; de drifttest
// importeert de lezer hierboven en mag niets overschrijven.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const presets = leesKernVoorinstellingen();
  writeFileSync(DOEL_PAD, bouwTsBestand(presets), "utf8");
  process.stdout.write(
    `${presets.length} CLT-voorinstellingen geschreven naar ${DOEL_PAD}\n`,
  );
}
