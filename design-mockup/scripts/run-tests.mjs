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
  "combinatieselectie",
  // Rekent een externe referentie-berekening na (twee houten liggerlijnen) en
  // raakt daarbij uitsluitend de adapterlaag: `engine`, `combinations`,
  // `sectionResolver` en de twee check-builders — precies wat de barrel
  // ontsluit. Juist deze verificatie hoort óók in de bundelstand: zij is de
  // proef dat de sidecar dezelfde krachtsverdeling geeft als de bron, tegen
  // getallen van buiten dit project.
  "dakconstructie-referentie",
  "doorbuiging-toets",
  "hoekverdraaiing",
  // Bewaakt dat de kniklengte van een HOUTEN staaf tot in de toetsinvoer
  // komt (buckling_length_y_m/_z_m in TimberBeamCheckInput). Praat alleen met
  // `engine`, `combinations` en de twee check-builders — precies wat de
  // barrel ontsluit, dus hij kan óók tegen de sidecarbundel. Dat is hier de
  // bedoeling: als de bundel de kniklengte laat vallen, rekent de sidecar met
  // de volle systeemlengte terwijl de bron met de opgegeven steunafstand
  // rekent, en dat verschil hoort luid op te vallen.
  "hout-kniklengte",
  "lastomschrijving",
  "leeg-geval",
  "n-teken",
  "omhullende",
  "plaat-adapter",
  "plaat-combinatie",
  "plaat-polygoon",
  "plaat-project",
  "plaat-randlast",
  "plaat-randstaaf",
  "plaat-validatie",
  "qrichting",
  "releases",
  // Verende staafaansluitingen: engine + bouwMultiInput, allebei in de barrel.
  "staafveren",
  "scheefstand",
  "sectie-doorvoer",
  // Toetst waar de adapter zijn rekenknopen legt (deellastgrenzen,
  // `extraSneden`, de samenvoegregel) en praat daarvoor uitsluitend met
  // `engine` — solve/solveAllCases, precies wat de barrel ontsluit. Hoort
  // juist óók in de bundelstand: het stationsraster is wat de sidecar naar
  // buiten geeft, dus als de bundel daar afwijkt van de bron, moet dat hier
  // opvallen.
  "sneden",
  "staafsegmenten",
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
  [
    "tweede-orde-platen",
    "toetst de geometrische stijfheid van de wandschijven op matrixniveau en bouwt zijn modellen met Mesh + PlateRegion; Triangle, Quad4 en PlateRegion staan bewust niet in de barrel (PlateRegion zou TriangleService en window.location de bundel in trekken). Het engine-pad dat hij aan het eind wél aanroept, is daar niet los van te knippen",
  ],
  [
    "bedding",
    "toetst de staaf op bedding door de adapter en de projectserialisatie (io/projectFile, lib/modelNaarSolverInput) — die twee staan niet in de barrel; de engine-kant zelf zit erin, maar de test is één geheel",
  ],
  [
    "solverlog",
    "leest het solverlogboek uit de zustand-store en geeft de kern rechtstreeks een onLog-callback; de store hoort niet in de barrel en de sidecar zet juist géén opvanger — tegen de bundel zou deze test dus het tegenovergestelde bewijzen van wat hij moet bewaken",
  ],
  ["plaat-schijf", "raakt kerninterne klassen (Triangle, Quad4, GaussElimination)"],
  [
    "oplossers",
    "vergelijkt de twee stelseloplossers rechtstreeks (Matrix, GaussElimination, SkylineSolver, LinearSolver); die staan bewust niet in de barrel",
  ],
  ["deellast", "test de zustand-store, niet de solver"],
  ["puntlast-positie", "test de zustand-store, niet de solver"],
  ["splitsen", "test de zustand-store, niet de solver"],
  ["stramien-verplaatsen", "test de zustand-store, niet de solver"],
  ["transform", "test de zustand-store, niet de solver"],
  [
    "lasten-kopieren",
    "test de store-logica voor het kopiëren van lasten tussen belastinggevallen; de solver dient er alleen als eindcontrole",
  ],
  [
    "modelcontrole",
    "test de modelcontrole en de herstelbewerkingen in de store; de acceptatieproef gebruikt de solver alleen als eindcontrole",
  ],
  ["ifc-export", "staat los van de solver (IFC-export)"],
  ["ifc-spiegel", "staat los van de solver (IFC-export spiegelt het model)"],
  ["profieleditor-snap", "test de objectsnap van de profieleditor, niet de solver"],
  ["oude-profielen", "controleert de overgetypte profieltabellen tegen de doorsnedemotor, niet de solver"],
  [
    "unp-tabel",
    "houdt de UNP-reeks in profiles.json en de gegenereerde TS-tabellen tegen de gedrukte profieltabel; leest die twee bestanden rechtstreeks en raakt de solver noch de barrel",
  ],
  ["profieleditor-lassen", "test de schuifstroom per lasnaad uit de doorsnedemeetkunde, niet de solver"],
  ["profieleditor-transform", "test het verplaatsen en roteren in de editor, niet de solver"],
  ["clt-builder", "test de invoerbouwer voor de houttoetsing, niet de solver"],
  [
    "clt-opbouwen",
    "test de bibliotheken van eigen CLT-opbouwen en eigen doorsneden: de winkels op localStorage, het samenvoegen bij het openen van een project en wat er in een projectbestand terechtkomt. Dat is invoerbeheer van de frontend — de solver komt er niet aan te pas en de winkels horen niet in de barrel",
  ],
  [
    "clt-voorinstellingen",
    "houdt de gegenereerde CLT-voorinstellingen tegen de Rust-kern aan: hij leest clt.rs als BRONBESTAND en importeert de generator uit scripts/ — allebei staan ze buiten de barrel, en tegen de bundel zou hij juist de generatiestap overslaan die hij moet bewaken",
  ],
  ["spanning-builder", "test de invoerbouwer voor de spanningstoets, niet de solver"],
  [
    "rapportpdf-invoer",
    "zet de stores om naar de invoer van de PDF-uitdraai (`lib/rapportPdfInvoer`) — rapportagelogica van de frontend die de solver niet raakt en dus niet in de barrel hoort",
  ],
  [
    "sectierelevantie",
    "beoordeelt welke RAPPORTSECTIES een model kan vullen — presentatielogica van de frontend die niets met de solver of de sidecar te maken heeft en dus niet in de barrel hoort; de test leest bovendien de sectieregistry als bronbestand",
  ],
  ["plaat-gewicht", "vraagt een extra kernmodule (PlateLoads)"],
  ["modelmapping", "vergelijkt de bronmapping met een gouden JSON"],
  [
    "fysisch-nietlineair",
    "drijft de lus uit lib/betonStijfheid, die de Rust-rekenkern nodig heeft en dus niet in de barrel hoort; het echte-kernblok start de toetsbrug als apart proces en wordt luid overgeslagen als die binary ontbreekt",
  ],
  [
    "kolomtoets",
    "de §5.8-invoer van een betonnen kolom: de gevallen van figuur 5.7 uit components/beton/kolomgegevens, de doorvoer via korvenUitStaven (een zustand-store) en betonCheckBuilder, en een blok dat de toetsbrug als apart proces aanroept. Twee van die drie modules staan buiten de barrel — het korfmodel en de store — en de Rust-kern hoort er sowieso niet in, dus tegen de sidecarbundel zou de test juist de laag overslaan die hij moet bewaken",
  ],
  [
    "sidecar",
    "start de sidecar als eigen proces — en draait daarin zelf al bron én bundel",
  ],
  [
    "golden",
    "spreekt de bundel rechtstreeks als proces aan; herschrijven zou hem juist van het gouden artefact afhalen",
  ],
  [
    "beff-liggerlijn",
    "leidt de liggerlijn van 5.3.2.1 uit de modeltopologie af (knopen, staven, opleggingen); dat is invoerbouw voor de betontoetsing en geen solverwerk, dus hij hoort niet in de barrel",
  ],
  [
    "profielvarianten",
    "kiest naburige doorsneden uit de profieldatabase en de handelsmatenlijst en bouwt daarmee toetsinvoer; dat is invoerbouw en geen solverwerk, en de korfcontrole die hij meeneemt hoort niet in de barrel",
  ],
  [
    "beton-doorsnede",
    "test de profielnaam-grammatica en het korfmodel van de betontoetsing; alleen de solverstijfheid daarvan (resolveSection) zit in de barrel, de rest is invoerbouw en tekenmeetkunde",
  ],
  [
    "betonfiguren-referentie",
    "legt de tekenmeetkunde van wapeningskorf.ts naast de gedeelde referentie die de Rust-kant óók leest (src-tauri/crates/report/tests/golden/betonfiguren-referentie.json); tekenwerk in plaats van solverwerk, en de referentie ligt buiten de bundel",
  ],
  [
    "dekking-per-zijde",
    "test het korfmodel van components/beton/wapeningskorf.ts met een eigen dekking en milieuklasse per betonoppervlak (4.4.1.1(1)P): de nuttige hoogte per trekzijde, de staafposities, s_t en de korfcontrole. Dat is invoerbouw en tekenmeetkunde van de frontend — de solver komt er niet aan te pas en wapeningskorf zit niet in de barrel van de sidecarbundel",
  ],
  [
    "cltmeetkunde-referentie",
    "legt de CLT-mechanica van cltCheckBuilder.ts (zwaartelijn, (EI)_ef, I_ef,net, de opbouw van I_y per laag en de bemonstering van het τ-verloop) naast de gedeelde referentie die de Rust-kant óók leest (src-tauri/crates/report/tests/golden/cltmeetkunde-referentie.json); die referentie is een bronbestand buiten de bundel, en de test importeert daarnaast TIMBER_E_MEAN uit sectionResolver om de tweede E-tabel te toetsen — rapport- en tekenwerk, geen solverwerk",
  ],
  [
    "doorsnede-kleur",
    "rendert ProfielMiniatuur én DoorsnedeTekening met react-dom/server en rekent de composietkleur na uit themes.css en ProfielKiezer.css; React en losse stylesheets bestaan in de sidecarbundel niet, en er komt geen rekenwerk aan te pas",
  ],
  [
    "bgvloer-referentie",
    "legt een betonnen plaatstrook uit een externe referentie-berekening naast de hele keten: hij bouwt de toetsinvoer met `lib/betonCheckBuilder` én `stores/checkStore` (de toetsstore valt buiten de barrel) en start de toetsbrug als apart proces voor de echte EN 1992-toetsing; zonder die binary faalt hij luid",
  ],
  [
    "startmodel",
    "bewaakt het model waarmee de app opent (`hooks/useFemStore`): samenstelling, opleggingen, evenwicht en toetsbaarheid. Hij leest de React-hook en de toetsstore, die allebei buiten de barrel van de sidecarbundel vallen, en stubt de staalprofieldatabase omdat die uit de Rust-kern komt",
  ],
  [
    "snedetekens",
    "rendert de resultatenoverlay met react-dom/server en meet de RICHTING van de afschuif- en buigtekens in de gerenderde SVG; dat is canvasweergave in plaats van solverwerk, en React bestaat in de sidecarbundel niet",
  ],
  [
    "korftekening",
    "rendert DoorsnedeTekening met react-dom/server en meet de LIGGING van de beugel en de staven terug uit de gerenderde SVG (schaal uit de omtrek, staafharten in millimeters, ligt-de-staaf-in-de-polygoon); tekenwerk in plaats van solverwerk, en React bestaat in de sidecarbundel niet",
  ],
  [
    "dekkingsvenster",
    "het betonvenster onderin: het zonemodel (de TS-spiegel van ReinforcementZones), de afleiding van de vier lagen, en AanzichtTekening gerenderd met react-dom/server waaruit de LIGGING van de trapjes en van het rode tekortvak in millimeters wordt teruggemeten. Drie redenen om op de bron te blijven: React bestaat in de sidecarbundel niet, het korf- en zonemodel van de frontend zit niet in de barrel, en het laatste blok start de toetsbrug als apart proces voor de echte EN 1992-uitkomsten",
  ],
  [
    "unp-flenshelling",
    "meet het oppervlak van de GETEKENDE contour van de U-profielen tegen de cataloguswaarde, om vast te leggen dat een UNP taps toeloopt en een UPE niet; tekenmeetkunde in plaats van solverwerk, en de contourfuncties zitten niet in de barrel",
  ],
  [
    "i18n-talen",
    "leest alleen de JSON-taalbestanden en config.ts van schijf en importeert geen enkele bronmodule; de bundelstand heeft er dus niets in te toetsen, en de runner weigert terecht een test zonder ./src-import",
  ],
  [
    "projectbestand",
    "serialiseert en leest het projectbestand terug (io/projectFile) en zet de rapportinstellingen in de zustand-store; projectFile en de rapportstore staan niet in de barrel",
  ],
  [
    "wind-schema",
    "rendert de doorsnede- en plattegrondtekening van het windvenster met react-dom/server en leest de staven, pijlen en maten terug uit de SVG; tekenwerk, en React bestaat in de sidecarbundel niet",
  ],
  [
    "inp-flenshelling",
    "hetzelfde voor de I-profielen: de getekende INP-contour (14 %, tf op b/4 vanaf de tip) tegen de cataloguswaarde, en een IPE die evenwijdig blijft; tekenmeetkunde, niet in de barrel",
  ],
  [
    "rapportnormen",
    "bepaalt welke normen het rapport mag noemen (`lib/normenInRapport`) uit de uitgangspunten, de toetsresultaten en de materialen in het model — presentatielogica van de frontend die de solver niet raakt en dus niet in de barrel hoort",
  ],
  [
    "dekkingslijn",
    "legt de hele keten van de dekkingslijn vast: de zonegrenzen uit `lib/betonZoneSneden` worden rekenknopen via `bouwMultiInput`, de zones reizen door `lib/betonCheckBuilder` en `lib/betonDekkingslijnBuilder` naar de kern, en het slotblok start de toetsbrug als apart proces voor het echte `concrete_dekkingslijn`. Hij leest daarvoor `stores/checkStore` (de toetsstore) en de twee invoerbouwers, en die vallen alle drie buiten de barrel van de sidecarbundel; tegen de bundel zou hij juist de aansluiting overslaan die hij moet bewaken. De solverkant van hetzelfde mechanisme — `extraSneden` als zodanig — staat in `test-sneden` en draait wél tegen de bundel",
  ],
  [
    "scheefstand-norm",
    "rekent φ uit volgens EN 1993-1-1 (5.5), EN 1992-1-1 (5.1) en EN 1995-1-1 (5.1) en leidt h en m uit het model af (`lib/scheefstandNorm`). Dat is een PROJECTINSTELLING van de frontend: de gebruiker kiest de norm, en de sidecar krijgt het resultaat gewoon als getal (`scheefstandNoemer`) binnen. De module zit daarom niet in de barrel — de motorkant van dezelfde zaak (H = φ·V) staat in `test-scheefstand`, en die draait wél tegen de bundel",
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
