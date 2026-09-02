#!/usr/bin/env node
/**
 * Bouwt de solver-sidecarbundel voor de MCP-server.
 *
 * De bundel is een gegenereerd artefact dat in versiebeheer staat, omdat de
 * Rust-server hem met `include_str!` in de binary bakt. Daardoor kan er nooit
 * een oude bundel naast een nieuwe binary staan: er is precies een artefact.
 *
 * Drie sloten bewaken dat de bundel niet stil oud wordt:
 *   1. dit script schrijft de SHA-256 naast de bundel;
 *   2. `build.rs` van de MCP-server faalt lokaal bij een verschil;
 *   3. CI herbouwt en vergelijkt byte-voor-byte.
 *
 * Gebruik:  npm run build:sidecar
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, "..");
const repoRoot = resolve(frontendRoot, "..");

const INVOER = join(frontendRoot, "src", "mcp", "kernel-exports.ts");
const ASSETS_DIR = join(
  repoRoot,
  "src-tauri",
  "crates",
  "openaec-mcp-server",
  "assets",
);
const BUNDEL = join(ASSETS_DIR, "fem-kernel.mjs");
const HASHBESTAND = join(ASSETS_DIR, "fem-kernel.sha256");

/**
 * Strings die niet in de bundel mogen voorkomen. Elk van deze treffers betekent
 * dat de importgraaf browser- of Tauri-glue heeft meegetrokken; die code kan in
 * een kaal Node-proces alleen maar crashen of — erger — stil iets anders doen.
 */
const VERBODEN = [
  {
    patroon: /window\./g,
    naam: "window.",
    reden: "browser-glue in de bundel; controleer of de barrel een DOM-module meetrekt",
  },
  {
    patroon: /document\./g,
    naam: "document.",
    reden: "DOM-glue in de bundel; gebruik benoemde exports in plaats van `export *`",
  },
  {
    patroon: /__TAURI/g,
    naam: "__TAURI",
    reden: "Tauri-runtime in de bundel; de sidecar draait in kaal Node, niet in de app",
  },
  {
    patroon: /triangle-wasm/g,
    naam: "triangle-wasm",
    reden: "de CDT-mesher hoort niet in de sidecar; polygoonplaten vereisen een meshcache",
  },
];

/** Regels die met `import` beginnen: overgebleven externe afhankelijkheden. */
const EXTERNE_IMPORT = /^import\b/gm;

function faal(melding, details = []) {
  console.error(`\nFOUT: ${melding}`);
  for (const regel of details) console.error(`  - ${regel}`);
  console.error("");
  process.exit(1);
}

const start = process.hrtime.bigint();

mkdirSync(ASSETS_DIR, { recursive: true });

const resultaat = await build({
  entryPoints: [INVOER],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  banner: {
    js: [
      "// GEGENEREERD BESTAND — niet met de hand aanpassen.",
      "// Bron: design-mockup/src/mcp/kernel-exports.ts",
      "// Herbouwen: npm run build:sidecar (in design-mockup/)",
    ].join("\n"),
  },
});

if (resultaat.errors.length > 0) {
  faal(
    "esbuild kon de bundel niet maken.",
    resultaat.errors.map((e) => e.text),
  );
}

const uitvoer = resultaat.outputFiles[0];
const code = uitvoer.text;

// --- Poort 1: verboden strings -------------------------------------------
const treffers = [];
for (const { patroon, naam, reden } of VERBODEN) {
  const aantal = (code.match(patroon) ?? []).length;
  if (aantal > 0) treffers.push(`${aantal}x "${naam}" — ${reden}`);
}
if (treffers.length > 0) {
  faal(
    "de bundel bevat code die in een kaal Node-proces niet mag voorkomen.",
    treffers,
  );
}

// --- Poort 2: geen externe imports ---------------------------------------
const externeImports = (code.match(EXTERNE_IMPORT) ?? []).length;
if (externeImports > 0) {
  faal(
    `de bundel heeft ${externeImports} externe import-regel(s); de sidecar moet volledig zelfdragend zijn.`,
    code
      .split("\n")
      .filter((r) => r.startsWith("import "))
      .slice(0, 10),
  );
}

// Pas schrijven nadat alle poorten geslaagd zijn: een afgekeurde bundel mag
// nooit op schijf achterblijven waar `include_str!` hem kan oppikken.
const bytes = Buffer.from(code, "utf8");
writeFileSync(BUNDEL, bytes);

const hash = createHash("sha256").update(bytes).digest("hex");
// sha256sum-formaat: te controleren met `sha256sum -c fem-kernel.sha256` en
// aan Rust-kant met het eerste witruimte-gescheiden veld.
writeFileSync(HASHBESTAND, `${hash}  fem-kernel.mjs\n`);

// --- Poort 3: laadt de bundel echt in kaal Node? --------------------------
// Een string-grep mist top-level toegang die pas bij het uitvoeren stukloopt.
let kernel;
try {
  kernel = await import(pathToFileURL(BUNDEL).href);
} catch (err) {
  faal("de bundel laadt niet in kaal Node.", [String(err)]);
}
for (const naam of ["solveAllCases", "solveAllCasesNonlinear", "bouwMultiInput"]) {
  if (typeof kernel[naam] !== "function") {
    faal(`de bundel exporteert \`${naam}\` niet als functie.`);
  }
}

const duurMs = Number(process.hrtime.bigint() - start) / 1e6;

console.log("Sidecarbundel gebouwd.");
console.log(`  bestand        : ${BUNDEL}`);
console.log(`  grootte        : ${bytes.length} bytes (${(bytes.length / 1024).toFixed(1)} kB)`);
console.log(`  sha256         : ${hash}`);
console.log(`  externe imports: ${externeImports}`);
console.log(`  verboden string: 0 van ${VERBODEN.length} patronen`);
console.log(`  bouwtijd       : ${duurMs.toFixed(0)} ms (inclusief controles)`);
