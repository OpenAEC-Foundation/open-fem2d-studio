#!/usr/bin/env node
/**
 * Regressierunner voor de solverbatterij.
 *
 * Twee standen, met verschillend bewijskarakter:
 *
 *   npm test           — alle `test-*.mjs` tegen de BRON, via `tsx`.
 *                        Dit bewaakt of de solver juist rekent.
 *   npm run test:bundel — de adaptertests tegen de gebundelde SIDECAR
 *                        (`assets/fem-kernel.mjs`), met kaal `node`.
 *                        Dit bewaakt of de bundel een getrouwe afgeleide van
 *                        de bron is, en of hij het zonder DOM, zonder Tauri en
 *                        zonder bundler daadwerkelijk doet.
 *
 * Waarom niet alle tests tegen de bundel draaien: dertien tests raken de
 * kern rechtstreeks (`Mesh`, `PlateRegion`, `Assembler`, `DKT`, `Quad4`,
 * `Triangle`, `Matrix`, `GaussElimination`), de zustand-store, of staan er
 * los van. Die horen op de bron te blijven — ze bewaken de kern, niet het
 * MCP-artefact. Ophogen door `PlateRegion` in de barrel te trekken mag NIET:
 * dat haalt `TriangleService` en daarmee `window.location.origin` de bundel
 * in, en het bundelscript keurt de bundel dan (terecht) af.
 *
 * Twee mechanische valkuilen die deze runner respecteert:
 *
 *  1. Testbestanden worden NIET naar een andere map gekopieerd. Fixturepaden
 *     worden relatief aan het testbestand opgelost — `test-checkconfig.mjs`
 *     leest `../voorbeelden/houten-raamwerk.ifcfem2d` via `import.meta.url`.
 *     Verplaatsen breekt dat stil. De herschreven kopie komt daarom NAAST het
 *     origineel te staan, met een naam die buiten `test-*.mjs` valt zodat hij
 *     nooit als testbestand wordt opgepikt.
 *  2. Het bundelpad gaat als `file://`-URL de import in. Een kaal
 *     `C:/...`-pad is op Windows geen geldige ESM-specifier; alle
 *     bundeltests vallen daarop om.
 *
 * Gebruik:
 *   node scripts/run-tests.mjs [--bundel] [--filter=<deel>] [--breed]
 *
 *   --bundel        draai de adaptertests tegen de sidecarbundel
 *   --filter=<deel> alleen tests waarvan de naam <deel> bevat
 *   --breed         toon de volledige uitvoer van elke test, ook bij succes
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, "..");
const repoRoot = resolve(frontendRoot, "..");

const BUNDEL = join(
  repoRoot,
  "src-tauri",
  "crates",
  "openaec-mcp-server",
  "assets",
  "fem-kernel.mjs",
);

const TSX_CLI = join(frontendRoot, "node_modules", "tsx", "dist", "cli.mjs");

/** Voorvoegsel van de herschreven kopieën; valt buiten de `test-*.mjs`-glob. */
const KOPIE_PREFIX = ".bundelrun-";

/** Tijdslimiet per test. Ruim: `test-tweede-orde` start zelf drie subtests. */
const TIJDSLIMIET_MS = 300_000;

/**
 * De tests die tegen de bundel kunnen draaien: ze praten uitsluitend met de
 * adapterlaag (`engine`, `combinations`, de check-builders, `sectionResolver`,
 * `femTypes`, de windmodules en `projectFile`) — precies wat de barrel
 * ontsluit.
 */
const BUNDEL_TESTS = new Set([
  "checkconfig",
  "doorbuiging-toets",
  "leeg-geval",
  "n-teken",
  "plaat-adapter",
  "plaat-combinatie",
  "plaat-polygoon",
  "plaat-project",
  "plaat-randlast",
  "plaat-randstaaf",
  "plaat-validatie",
  "qrichting",
  "releases",
  "scheefstand",
  "sectie-doorvoer",
  "thermiek",
  "tweede-orde",
  "v2-stations",
  "validatie-mcp",
  "veldzakking",
  "veren",
  "wind-generator",
  "wind-eurocode",
]);

/**
 * Waarom de overige tests op de bron blijven. Expliciet opgeschreven zodat een
 * ontbrekende test in de bundelstand een gedocumenteerde keuze is en geen
 * vergeten regel.
 */
const ALLEEN_BRON = new Map([
  ["pendelstaaf", "raakt kerninterne klassen (Assembler, Matrix)"],
  ["plaat-dkt", "raakt kerninterne klassen (Mesh, PlateRegion, DKT)"],
  ["plaat-ids", "raakt kerninterne klassen (Mesh, PlateRegion)"],
  ["plaat-lasten", "raakt kerninterne klassen (Mesh, PlateRegion, PlateLoads)"],
  ["plaat-mixed", "raakt kerninterne klassen (Mesh, PlateRegion, NonlinearSolver)"],
  ["plaat-schijf", "raakt kerninterne klassen (Triangle, Quad4, GaussElimination)"],
  ["deellast", "test de zustand-store, niet de solver"],
  ["puntlast-positie", "test de zustand-store, niet de solver"],
  ["splitsen", "test de zustand-store, niet de solver"],
  ["stramien-verplaatsen", "test de zustand-store, niet de solver"],
  ["transform", "test de zustand-store, niet de solver"],
  ["ifc-export", "staat los van de solver (IFC-export)"],
  ["plaat-gewicht", "vraagt een extra kernmodule (PlateLoads)"],
  ["modelmapping", "vergelijkt de bronmapping met een gouden JSON"],
  [
    "sidecar",
    "start de sidecar als eigen proces — en draait daarin zelf al bron én bundel",
  ],
]);

// ── Argumenten ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const bundelStand = args.includes("--bundel");
const breed = args.includes("--breed");
const filterArg = args.find((a) => a.startsWith("--filter="));
const filter = filterArg ? filterArg.slice("--filter=".length) : null;

const onbekend = args.filter(
  (a) => !["--bundel", "--breed"].includes(a) && !a.startsWith("--filter="),
);
if (onbekend.length > 0) {
  console.error(`Onbekende optie(s): ${onbekend.join(", ")}`);
  console.error(
    "Gebruik: node scripts/run-tests.mjs [--bundel] [--filter=<deel>] [--breed]",
  );
  process.exit(2);
}

/** Basisnaam zonder `test-`-voorvoegsel en zonder `.mjs`. */
const basisnaam = (bestand) => bestand.replace(/^test-/, "").replace(/\.mjs$/, "");

// ── Testbestanden verzamelen ──────────────────────────────────────────────
const alleTests = readdirSync(frontendRoot)
  .filter((n) => n.startsWith("test-") && n.endsWith(".mjs"))
  .sort();

if (alleTests.length === 0) {
  console.error(`Geen test-*.mjs gevonden in ${frontendRoot}.`);
  process.exit(2);
}

let tests = alleTests;
if (bundelStand) {
  tests = tests.filter((n) => BUNDEL_TESTS.has(basisnaam(n)));

  // Bewaak dat de lijst en de werkboom niet uit elkaar lopen: een test die in
  // BUNDEL_TESTS staat maar niet bestaat, of een nieuwe test die in geen van
  // beide lijsten staat, is een stille gat in de dekking.
  const aanwezig = new Set(alleTests.map(basisnaam));
  const ontbrekend = [...BUNDEL_TESTS].filter((n) => !aanwezig.has(n));
  if (ontbrekend.length > 0) {
    console.error(
      `Bundellijst noemt tests die niet bestaan: ${ontbrekend.join(", ")}`,
    );
    process.exit(2);
  }
  const ongeplaatst = [...aanwezig].filter(
    (n) => !BUNDEL_TESTS.has(n) && !ALLEEN_BRON.has(n),
  );
  if (ongeplaatst.length > 0) {
    console.error(
      `Test(s) zonder plaatsbepaling: ${ongeplaatst.join(", ")}.\n` +
        "Zet elke nieuwe test in BUNDEL_TESTS of in ALLEEN_BRON (met reden) " +
        "in scripts/run-tests.mjs.",
    );
    process.exit(2);
  }
}
if (filter) tests = tests.filter((n) => n.includes(filter));

if (tests.length === 0) {
  console.error("Geen tests over na filtering.");
  process.exit(2);
}

// ── Voorwaarden per stand ─────────────────────────────────────────────────
if (bundelStand && !existsSync(BUNDEL)) {
  console.error(
    `Sidecarbundel ontbreekt: ${BUNDEL}\n` +
      "Bouw hem eerst met: npm run build:sidecar",
  );
  process.exit(2);
}
if (!bundelStand && !existsSync(TSX_CLI)) {
  console.error(
    `tsx ontbreekt: ${TSX_CLI}\nDraai eerst: npm ci (in design-mockup/)`,
  );
  process.exit(2);
}

/** Bundelpad als `file://`-URL — een kaal `C:/...`-pad is geen ESM-specifier. */
const bundelUrl = pathToFileURL(BUNDEL).href;

/** Elke `"./src/…​.ts"`-specifier in een testbestand, ongeacht de aanhalingsvorm. */
const BRON_SPECIFIER = /(["'])\.\/src\/[^"']*\.ts\1/g;

/** Restanten van een afgebroken eerdere run opruimen. */
function ruimKopieënOp() {
  for (const naam of readdirSync(frontendRoot)) {
    if (naam.startsWith(KOPIE_PREFIX)) {
      rmSync(join(frontendRoot, naam), { force: true });
    }
  }
}

/**
 * Schrijft een kopie van `bestand` NAAST het origineel waarin elke
 * bron-import naar de bundel wijst. Naast het origineel, want fixturepaden
 * worden relatief aan het testbestand opgelost.
 */
function schrijfBundelKopie(bestand) {
  const bron = readFileSync(join(frontendRoot, bestand), "utf8");
  let vervangingen = 0;
  const herschreven = bron.replace(BRON_SPECIFIER, () => {
    vervangingen++;
    return JSON.stringify(bundelUrl);
  });
  if (vervangingen === 0) {
    throw new Error(
      `${bestand} importeert geen enkele "./src/…" module; hij hoort niet in ` +
        "de bundelstand thuis.",
    );
  }
  const kopie = join(frontendRoot, `${KOPIE_PREFIX}${bestand}`);
  writeFileSync(kopie, herschreven);
  return { kopie, vervangingen };
}

/** Start een testproces en verzamelt uitvoer, exitcode en looptijd. */
function draai(commando, argumenten) {
  return new Promise((klaar) => {
    const start = process.hrtime.bigint();
    const kind = spawn(commando, argumenten, {
      cwd: frontendRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let uit = "";
    let fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));

    const wekker = setTimeout(() => {
      kind.kill("SIGKILL");
      fout += `\n[runner] tijdslimiet van ${TIJDSLIMIET_MS / 1000} s overschreden.\n`;
    }, TIJDSLIMIET_MS);

    kind.on("error", (err) => {
      clearTimeout(wekker);
      klaar({ code: -1, uit, fout: `${fout}${err.message}`, ms: 0 });
    });
    kind.on("close", (code) => {
      clearTimeout(wekker);
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      klaar({ code, uit, fout, ms });
    });
  });
}

/**
 * Haalt "<n> geslaagd, <m> gefaald" uit de uitvoer. De batterij schrijft die
 * regel in wisselende opmaak; de laatste treffer is de eindstand. Valt terug
 * op het tellen van vinkjes, zodat een test zonder slotregel geen nul meldt.
 */
function telChecks(tekst) {
  const treffers = [...tekst.matchAll(/(\d+)\s+geslaagd,\s+(\d+)\s+gefaald/g)];
  if (treffers.length > 0) {
    const laatste = treffers[treffers.length - 1];
    return { geslaagd: Number(laatste[1]), gefaald: Number(laatste[2]) };
  }
  return {
    geslaagd: (tekst.match(/✓/g) ?? []).length,
    gefaald: (tekst.match(/✗/g) ?? []).length,
  };
}

// ── Uitvoeren ─────────────────────────────────────────────────────────────
const stand = bundelStand ? "BUNDEL (kaal node)" : "BRON (tsx)";
console.log(`Solverbatterij — stand: ${stand}`);
console.log(`  map     : ${frontendRoot}`);
if (bundelStand) console.log(`  bundel  : ${BUNDEL}`);
console.log(`  tests   : ${tests.length}${filter ? ` (filter "${filter}")` : ""}`);
console.log("");

ruimKopieënOp();

const uitslagen = [];
let totaalGeslaagd = 0;
let totaalGefaald = 0;

for (const bestand of tests) {
  const naam = basisnaam(bestand);
  let kopie = null;
  let uitslag;

  try {
    let commando;
    let argumenten;
    if (bundelStand) {
      const geschreven = schrijfBundelKopie(bestand);
      kopie = geschreven.kopie;
      commando = process.execPath;
      argumenten = [kopie];
    } else {
      commando = process.execPath;
      argumenten = [TSX_CLI, join(frontendRoot, bestand)];
    }
    uitslag = await draai(commando, argumenten);
  } catch (err) {
    uitslag = { code: -1, uit: "", fout: String(err), ms: 0 };
  } finally {
    if (kopie) rmSync(kopie, { force: true });
  }

  const alles = `${uitslag.uit}${uitslag.fout}`;
  const { geslaagd, gefaald } = telChecks(alles);
  const ok = uitslag.code === 0;
  totaalGeslaagd += geslaagd;
  totaalGefaald += gefaald;
  uitslagen.push({ naam, ok, geslaagd, gefaald, ms: uitslag.ms, alles });

  const merk = ok ? "PASS" : "FAAL";
  console.log(
    `  ${merk}  ${naam.padEnd(24)} ${String(geslaagd).padStart(4)} geslaagd, ` +
      `${String(gefaald).padStart(3)} gefaald  (${uitslag.ms.toFixed(0)} ms)`,
  );
  if (breed || !ok) {
    console.log(
      alles
        .trimEnd()
        .split("\n")
        .map((r) => `        │ ${r}`)
        .join("\n"),
    );
    console.log("");
  }
}

// ── Samenvatting ──────────────────────────────────────────────────────────
const gefaaldeTests = uitslagen.filter((u) => !u.ok);

console.log("");
console.log("─".repeat(72));
console.log(
  `${stand}: ${uitslagen.length - gefaaldeTests.length}/${uitslagen.length} ` +
    `testbestanden geslaagd — ${totaalGeslaagd} checks geslaagd, ` +
    `${totaalGefaald} gefaald.`,
);

if (bundelStand && !filter) {
  console.log(
    `Op de bron gebleven: ${ALLEEN_BRON.size} test(s) — zie ALLEEN_BRON in ` +
      "scripts/run-tests.mjs voor de reden per test.",
  );
}

if (gefaaldeTests.length > 0) {
  console.log("");
  console.log("Gefaald:");
  for (const u of gefaaldeTests) console.log(`  - ${u.naam}`);
  process.exit(1);
}

process.exit(0);
