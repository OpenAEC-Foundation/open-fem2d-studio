// Gouden portaalmodel — LEZER 1 van 2: de solverbundel (taak T13).
//
// WAAROM ER TWEE LEZERS ZIJN
// Het gouden bestand `tests/golden/portaal.verwacht.json` beschrijft wat het
// referentieportaal uit het implementatieplan §5.1 hoort op te leveren. Deze
// test toetst dat de BUNDEL (`assets/fem-kernel.mjs`) — het artefact dat via
// `include_str!` in de MCP-binary zit — dat ook werkelijk oplevert. De tweede
// lezer, `tests/fem_golden.rs`, toetst hetzelfde langs de MCP-tool. Eén lezer
// zou alleen bewijzen dat het bestand bij zichzelf past; twee lezers langs
// verschillende wegen bewijzen dat de hele keten hetzelfde antwoord geeft.
//
// WAT DEZE TEST OVER DRIFT ZEGT
// De gouden waarden zijn GEGENEREERD door `scripts/genereer-golden.mjs`, nooit
// met de hand geschreven. De reden staat in het plan §1.2: de profieldata is
// tijdens dit traject al gedrift (HEA 160 ging van A = 3877 naar A = 3880).
// Deze test maakt zo'n drift zichtbaar in drie lagen die je uit elkaar kunt
// houden:
//
//   [1] HERKOMST   — is de doorsnede waarmee de solver rekent nog dezelfde als
//                    toen het gouden bestand werd geschreven? Verschuift die,
//                    dan faalt deze laag als EERSTE en noemt hij het profiel en
//                    het getal. Dat is de verklaring voor alles daarna.
//   [2] INVARIANTEN — ½·q·L, q·L²/8 en de superpositie. Die hangen niet van A
//                    en I af. Houden ze stand terwijl [1] faalt, dan is er
//                    profieldata gewijzigd en geen rekenfout. Breken ze, dan is
//                    het andersom.
//   [3] WAARDEN     — elke gegenereerde uitkomst, exact vergeleken.
//
// Bij een gefaalde vergelijking is de opdracht NOOIT om het gouden bestand met
// de hand bij te werken. Draai `node scripts/genereer-golden.mjs` en beoordeel
// de diff die dat script zelf al uitschrijft.
//
// Draaien met: npx tsx test-golden.mjs  (of: node scripts/run-tests.mjs --filter=golden)

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..");
const CRATE = join(REPO, "src-tauri", "crates", "openaec-mcp-server");
const BUNDEL = join(CRATE, "assets", "fem-kernel.mjs");
const GOLDEN_MAP = join(CRATE, "tests", "golden");
const PROJECT = join(GOLDEN_MAP, "portaal.ifcfem2d");
const GOLDEN = join(GOLDEN_MAP, "portaal.verwacht.json");
const PROFIELEN_JSON = join(
  REPO,
  "src-tauri",
  "crates",
  "steel-profiles",
  "data",
  "profiles.json",
);

let passed = 0;
let failed = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) {
    passed++;
    log(`  ✓ ${naam}${extra ? " — " + extra : ""}`);
  } else {
    failed++;
    log(`  ✗ ${naam}${extra ? " — " + extra : ""}`);
  }
}

function eindig(code) {
  log("");
  log(`${passed} geslaagd, ${failed} gefaald`);
  process.exit(code ?? (failed === 0 ? 0 : 1));
}

// ── Voorwaarden ────────────────────────────────────────────────────────────

for (const [naam, pad] of [
  ["de sidecarbundel", BUNDEL],
  ["het gouden modelbestand", PROJECT],
  ["het gouden verwachtingsbestand", GOLDEN],
]) {
  if (!existsSync(pad)) {
    log(`  ✗ ${naam} ontbreekt: ${pad}`);
    log("    Bouw de bundel met `npm run build:sidecar` en schrijf de verwachting");
    log("    met `node scripts/genereer-golden.mjs`.");
    failed++;
    eindig(1);
  }
}

const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
const projectTekst = readFileSync(PROJECT, "utf8");
const profielCatalogus = JSON.parse(readFileSync(PROFIELEN_JSON, "utf8"));

// ── De bundel aanroepen ────────────────────────────────────────────────────
// Als eigen proces met kaal `node`, precies zoals de Rust-server het doet.

function roepBundelAan(verzoeken) {
  return new Promise((klaar) => {
    const kind = spawn(process.execPath, [BUNDEL, "--sidecar"], { cwd: HIER });
    let uit = "";
    let fout = "";
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("close", (code) => {
      const regels = uit.split("\n").filter((r) => r.trim().length > 0);
      let antwoorden = [];
      try {
        antwoorden = regels.map((r) => JSON.parse(r));
      } catch (err) {
        fout += `\nonleesbare stdout: ${err}`;
      }
      klaar({ code, antwoorden, stderr: fout });
    });
    kind.stdin.write(verzoeken.map((v) => JSON.stringify(v)).join("\n") + "\n");
    kind.stdin.end();
  });
}

const uitslag = await roepBundelAan([
  {
    v: 1,
    id: 1,
    op: "solve",
    payload: {
      project: { inhoud: projectTekst },
      detail: golden.verzoek.detail,
      profiles: profielCatalogus,
    },
  },
]);

log("\n[0] De bundel rekent het gouden model door");
ok("exitcode 0", uitslag.code === 0, `code ${uitslag.code} ${uitslag.stderr.trim()}`.trim());
const antwoord = uitslag.antwoorden[0];
ok("solve geslaagd", antwoord?.ok === true, antwoord?.error?.melding ?? "");
if (antwoord?.ok !== true) eindig(1);

const actueel = antwoord.result;

// ── [1] Herkomst ───────────────────────────────────────────────────────────
// De eerste laag, met opzet. Faalt deze, dan is elk verschil hieronder ermee
// verklaard en hoeft niemand naar een rekenfout te zoeken die er niet is.

log("\n[1] Herkomst — is er nog met dezelfde doorsnede gerekend?");
{
  const { resolveSection } = await import(pathToFileURL(BUNDEL).href);
  const project = JSON.parse(projectTekst);

  for (const beam of project.beams) {
    const verwacht = golden.herkomst.doorsneden[String(beam.id)];
    const nu = resolveSection(beam.material, beam.profile);
    ok(
      `staaf ${beam.id} (${beam.profile}): doorsnede uit de profieldatabase`,
      nu.bron === "staal-db" && nu.bron === verwacht.bron,
      `bron "${nu.bron}"${nu.bron === "default" ? " — resolveSection vond het profiel niet en rekent met de TERUGVAL A = 3877, I = 1,673e7" : ""}`,
    );
    ok(
      `staaf ${beam.id} (${beam.profile}): A = ${verwacht.A_mm2} mm²`,
      Object.is(nu.A, verwacht.A_mm2),
      `nu ${nu.A}`,
    );
    ok(
      `staaf ${beam.id} (${beam.profile}): I = ${verwacht.I_mm4} mm⁴`,
      Object.is(nu.I, verwacht.I_mm4),
      `nu ${nu.I}`,
    );
    ok(
      `staaf ${beam.id} (${beam.profile}): E = ${verwacht.E_n_per_mm2} N/mm²`,
      Object.is(nu.E, verwacht.E_n_per_mm2),
      `nu ${nu.E}`,
    );
  }

  // De tweede profielbron: de catalogus die de TOETSINVOER voedt. De solver
  // leest uit `steelSections.generated.ts`, de toetsing uit deze catalogus.
  // Lopen die uiteen, dan wordt dezelfde staaf met de ene doorsnede berekend en
  // met de andere getoetst — een fout die geen van beide kanten zelf ziet.
  const sleutel = (naam) =>
    [...naam].filter((c) => !/\s/.test(c) && c !== "-" && c !== ".").join("").toUpperCase();

  for (const [naam, verwacht] of Object.entries(golden.herkomst.profielen)) {
    const record = profielCatalogus.find((p) => sleutel(p.name) === sleutel(naam));
    ok(`profiel "${naam}" staat in de catalogus`, !!record);
    if (!record) continue;
    ok(
      `catalogus "${naam}": area_mm2 = ${verwacht.area_mm2}`,
      Object.is(record.properties.area_mm2, verwacht.area_mm2),
      `nu ${record.properties.area_mm2}`,
    );
    ok(
      `catalogus "${naam}": iy_mm4 = ${verwacht.iy_mm4}`,
      Object.is(record.properties.iy_mm4, verwacht.iy_mm4),
      `nu ${record.properties.iy_mm4}`,
    );
    ok(
      `catalogus "${naam}": h = ${verwacht.h_mm} mm (bepaalt z_a_mm in de kiptoets)`,
      Object.is(record.geometry.h, verwacht.h_mm),
      `nu ${record.geometry.h}`,
    );
    const solverDoorsnede = Object.values(golden.herkomst.doorsneden).find(
      (d) => d.profile === naam,
    );
    ok(
      `"${naam}": solverbron en toetsingsbron noemen dezelfde A`,
      Object.is(record.properties.area_mm2, solverDoorsnede.A_mm2),
      `catalogus ${record.properties.area_mm2} vs solver ${solverDoorsnede.A_mm2}`,
    );
  }
}

// ── [2] Invarianten ────────────────────────────────────────────────────────
// Analytisch, dus onafhankelijk van A en I. Elke term is factor × operator op
// een pad; de som hoort binnen de tolerantie van de verwachting te liggen.

function opPad(waarde, pad) {
  let hier = waarde;
  for (const stap of pad) {
    if (hier === undefined || hier === null) return undefined;
    hier = hier[stap];
  }
  return hier;
}

function evalueerTerm(resultaat, term) {
  const waarde = opPad(resultaat, term.pad);
  if (waarde === undefined) {
    throw new Error(`pad ${term.pad.join(".")} bestaat niet in het antwoord`);
  }
  switch (term.operator) {
    case "waarde":
      return term.factor * waarde;
    case "abs":
      return term.factor * Math.abs(waarde);
    case "max_abs":
      return term.factor * Math.max(...waarde.map(Math.abs));
    case "min":
      return term.factor * Math.min(...waarde);
    default:
      throw new Error(`onbekende operator "${term.operator}"`);
  }
}

log("\n[2] Invarianten — analytisch, onafhankelijk van de profieldata");
for (const controle of golden.invarianten.controles) {
  let som;
  try {
    som = controle.termen.reduce((t, term) => t + evalueerTerm(actueel, term), 0);
  } catch (err) {
    ok(controle.naam, false, String(err));
    continue;
  }
  const afwijking = Math.abs(som - controle.verwacht);
  ok(
    controle.naam,
    afwijking <= controle.tolerantie,
    `${som} ${controle.eenheid} (verwacht ${controle.verwacht}; ${controle.afleiding}; ` +
      `|Δ| = ${afwijking.toExponential(2)}, tol ${controle.tolerantie})`,
  );
}

// ── [3] Waarden ────────────────────────────────────────────────────────────
// Exacte vergelijking. Bundel en gouden bestand komen uit dezelfde runtime, dus
// er is geen enkele reden voor een tolerantie: elk verschil is een echt verschil.

/** Alle bladwaarden als pad → waarde. */
function bladeren(waarde, pad = "", uit = new Map()) {
  if (waarde !== null && typeof waarde === "object") {
    for (const [k, v] of Object.entries(waarde)) bladeren(v, pad ? `${pad}.${k}` : k, uit);
  } else {
    uit.set(pad, waarde);
  }
  return uit;
}

log("\n[3] Waarden — elke gegenereerde uitkomst, exact");
{
  // Wat per bouw of per run verschilt zit bewust niet in het gouden bestand:
  // `solve_ms` is een klok, `bundle_hash` en `solver_version` veranderen bij elke
  // herbouw ook als er geen getal verschuift.
  const { solve_ms, bundle_hash, solver_version, ...gemeten } = actueel;
  void solve_ms;
  void bundle_hash;
  void solver_version;

  const verwacht = bladeren(golden.waarden);
  const nu = bladeren(gemeten);

  const ontbreekt = [...verwacht.keys()].filter((p) => !nu.has(p));
  const extra = [...nu.keys()].filter((p) => !verwacht.has(p));
  ok(
    "geen velden verdwenen uit het antwoord",
    ontbreekt.length === 0,
    ontbreekt.slice(0, 5).join(", "),
  );
  ok(
    "geen onverwachte velden in het antwoord",
    extra.length === 0,
    extra.slice(0, 5).join(", "),
  );

  const afwijkend = [...verwacht.keys()].filter(
    (p) => nu.has(p) && !Object.is(verwacht.get(p), nu.get(p)),
  );
  ok(
    `alle ${verwacht.size} gouden waarden exact gelijk`,
    afwijkend.length === 0,
    afwijkend.length === 0
      ? ""
      : `${afwijkend.length} afwijking(en), eerste vijf: ` +
        afwijkend
          .slice(0, 5)
          .map((p) => `${p}: ${verwacht.get(p)} → ${nu.get(p)}`)
          .join(" | "),
  );

  if (afwijkend.length > 0) {
    log("");
    log("    Werk het gouden bestand NIET met de hand bij. Draai");
    log("    `node scripts/genereer-golden.mjs` en beoordeel de diff die dat");
    log("    script uitschrijft; het meldt de herkomst apart en als eerste.");
  }
}

// ── [4] Het gouden bestand is gegenereerd en niet bijgewerkt ───────────────
// De laatste poort. `--controleer` regenereert in het geheugen en vergelijkt
// byte voor byte. Faalt dit terwijl [3] slaagde, dan is er met de hand aan het
// bestand gesleuteld — bijvoorbeeld door een verwachting bij te stellen om een
// test groen te krijgen.

log("\n[4] Het gouden bestand is een generatie, geen handwerk");
{
  const uit = await new Promise((klaar) => {
    const kind = spawn(
      process.execPath,
      [join(HIER, "scripts", "genereer-golden.mjs"), "--controleer"],
      { cwd: HIER },
    );
    let tekst = "";
    kind.stdout.on("data", (d) => (tekst += d));
    kind.stderr.on("data", (d) => (tekst += d));
    kind.on("close", (code) => klaar({ code, tekst }));
  });
  ok(
    "genereer-golden.mjs --controleer meldt geen verschil",
    uit.code === 0,
    uit.code === 0 ? "" : uit.tekst.trim().split("\n").slice(-6).join(" / "),
  );
}

eindig();
