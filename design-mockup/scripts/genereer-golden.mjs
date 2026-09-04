#!/usr/bin/env node
/**
 * genereer-golden.mjs — schrijft `tests/golden/portaal.verwacht.json` (taak T13).
 *
 * WAAROM DIT EEN SCRIPT IS EN GEEN HANDWERK
 * Tijdens dit traject is de profieldata al gedrift: HEA 160 ging van
 * A = 3877 mm² naar A = 3880 mm². Wie verwachte uitkomsten met de hand
 * overschrijft, verankert zo'n wijziging als bug of verbergt hem — beide keren
 * blijft de test groen terwijl de getallen veranderd zijn. Daarom worden de
 * gouden waarden GEGENEREERD, en wel door precies het artefact dat de
 * MCP-server ook uitvoert: `assets/fem-kernel.mjs`.
 *
 * WAT DIT SCRIPT DOET OM DRIFT ZICHTBAAR TE MAKEN IN PLAATS VAN STIL OVER TE NEMEN
 *
 *  1. Het legt de HERKOMST vast, niet alleen de uitkomst. Het gouden bestand
 *     bevat per staaf de doorsnede waarmee de solver werkelijk gerekend heeft
 *     (E, A, I én de BRON van die waarden), plus de profielrecords uit
 *     `steel-profiles/data/profiles.json` die de toetsinvoer voedden. Verschuift
 *     A van 3880 naar iets anders, dan staat dat als eigen regel in de diff, in
 *     plaats van als een onverklaarde verschuiving in het vierde decimaal van
 *     een zakking.
 *
 *  2. Het bewaakt de TWEE profielbronnen tegen elkaar. De solver leest A en I
 *     uit `src/lib/steelSections.generated.ts`; de toetsinvoer leest ze uit
 *     `steel-profiles/data/profiles.json`. Die eerste is uit die tweede
 *     gegenereerd. Lopen ze uiteen — bijvoorbeeld doordat de JSON is bijgewerkt
 *     zonder `node scripts/genereer-staalprofielen.mjs` opnieuw te draaien —
 *     dan weigert dit script te schrijven. Anders zou het een gouden bestand
 *     vastleggen waarin de berekening en de toetsing van hetzelfde profiel
 *     verschillende doorsneden gebruiken.
 *
 *  3. Het weigert een TERUGVAL-doorsnede. `resolveSection` valt bij een
 *     onbekende combinatie stil terug op de default (A = 3877, I = 1,673·10⁷ —
 *     de oude HEA 160-waarden). Die uitkomst oogt volstrekt plausibel. Zodra
 *     een staaf `bron: "default"` meldt, stopt dit script.
 *
 *  4. Het schrijft ANALYTISCHE INVARIANTEN mee, mechanisch afgeleid uit het
 *     model (q, L, de combinatiefactoren) en niet uit het solverantwoord. Die
 *     hangen niet van de profieldata af: ½·q·L, q·L²/8 en de superpositie
 *     blijven gelden ook als A en I veranderen. Zo is een profieldrift (waarden
 *     schuiven, invarianten blijven) te onderscheiden van een rekenfout
 *     (invariant breekt).
 *
 *  5. Het MELDT wat er verandert. Bestaat er al een gouden bestand, dan drukt
 *     dit script per gewijzigd veld oud → nieuw af, met de herkomst apart en
 *     als eerste. Een stille overschrijving bestaat niet.
 *
 * GEBRUIK
 *   node scripts/genereer-golden.mjs               schrijf het gouden bestand
 *   node scripts/genereer-golden.mjs --controleer  vergelijk zonder te schrijven
 *                                                  (exitcode 1 bij verschil)
 *
 * Het gouden bestand hoort byte-identiek te blijven als er niets is veranderd;
 * `--controleer` is de poort die dat afdwingt zonder git nodig te hebben.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HIER, "..");
const REPO = resolve(FRONTEND, "..");

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

/** Detailstand van de solve. "stations" dekt N, V, M en zakking per station. */
const DETAIL = "stations";

const argumenten = process.argv.slice(2);
const alleenControleren = argumenten.includes("--controleer");
const onbekend = argumenten.filter((a) => a !== "--controleer");
if (onbekend.length > 0) {
  console.error(`Onbekende optie(s): ${onbekend.join(", ")}`);
  console.error("Gebruik: node scripts/genereer-golden.mjs [--controleer]");
  process.exit(2);
}

function stop(melding) {
  console.error(`\nGENERATIE AFGEBROKEN\n  ${melding}\n`);
  process.exit(2);
}

// ── De bundel als proces aanroepen ─────────────────────────────────────────
// Dezelfde weg als de Rust-server: `node fem-kernel.mjs --sidecar`, NDJSON over
// stdio. Niet de bron via tsx — het gouden bestand hoort te beschrijven wat het
// artefact oplevert dat in de binary zit.

function roepBundelAan(verzoeken) {
  return new Promise((klaar, mislukt) => {
    const kind = spawn(process.execPath, [BUNDEL, "--sidecar"], { cwd: FRONTEND });
    let uit = "";
    let fout = "";
    kind.on("error", mislukt);
    kind.stdout.on("data", (d) => (uit += d));
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("close", (code) => {
      const regels = uit.split("\n").filter((r) => r.trim().length > 0);
      if (code !== 0) {
        mislukt(new Error(`de sidecar eindigde met code ${code}: ${fout.trim()}`));
        return;
      }
      try {
        klaar(regels.map((r) => JSON.parse(r)));
      } catch (err) {
        mislukt(new Error(`onleesbare regel op stdout: ${err} — ${uit.slice(0, 200)}`));
      }
    });
    kind.stdin.write(verzoeken.map((v) => JSON.stringify(v)).join("\n") + "\n");
    kind.stdin.end();
  });
}

// ── Invoer inlezen ─────────────────────────────────────────────────────────

if (!existsSync(BUNDEL)) {
  stop(
    `De sidecarbundel ontbreekt: ${BUNDEL}\n  ` +
      "Bouw hem eerst met: npm run build:sidecar",
  );
}
if (!existsSync(PROJECT)) stop(`Het gouden modelbestand ontbreekt: ${PROJECT}`);

const projectTekst = readFileSync(PROJECT, "utf8");
const project = JSON.parse(projectTekst);
const profielCatalogus = JSON.parse(readFileSync(PROFIELEN_JSON, "utf8"));

/** Zoeksleutel gelijk aan de Rust-lookup én aan `resolveSection`. */
const sleutel = (naam) =>
  [...naam].filter((c) => !/\s/.test(c) && c !== "-" && c !== ".").join("").toUpperCase();

// ── 1. Herkomst: waarmee is er werkelijk gerekend? ─────────────────────────
// `resolveSection` komt uit de BUNDEL, niet uit de bron: het is dezelfde functie
// die het Node-proces van de MCP-server uitvoert.

const { resolveSection } = await import(pathToFileURL(BUNDEL).href);

const doorsneden = {};
for (const beam of project.beams) {
  const sec = resolveSection(beam.material, beam.profile);
  if (sec.bron === "default") {
    stop(
      `Staaf ${beam.id} (${beam.material} / ${beam.profile}) kreeg de TERUGVAL-doorsnede ` +
        `(A = ${sec.A} mm², I = ${sec.I} mm⁴). resolveSection heeft het profiel niet ` +
        "gevonden en rekent met de default. Een gouden bestand daarop baseren legt een " +
        "verzonnen doorsnede vast als waarheid.",
    );
  }
  doorsneden[String(beam.id)] = {
    material: beam.material,
    profile: beam.profile,
    bron: sec.bron,
    E_n_per_mm2: sec.E,
    A_mm2: sec.A,
    I_mm4: sec.I,
  };
}

// De profielrecords die de TOETSINVOER voeden, uit dezelfde catalogus die de
// Rust-crate inbakt. Alleen de gebruikte profielen: een hash over het hele
// bestand zou dit gouden bestand rood maken bij elke wijziging elders.
const gebruikteProfielen = {};
for (const beam of project.beams) {
  const naam = beam.profile;
  if (gebruikteProfielen[naam]) continue;
  const record = profielCatalogus.find((p) => sleutel(p.name) === sleutel(naam));
  if (!record) {
    stop(
      `Profiel "${naam}" staat niet in ${PROFIELEN_JSON}. De toetsinvoer zou dan leeg ` +
        "blijven en het gouden bestand zou dat als normaal vastleggen.",
    );
  }
  gebruikteProfielen[naam] = {
    catalogusnaam: record.name,
    h_mm: record.geometry.h,
    b_mm: record.geometry.b,
    area_mm2: record.properties.area_mm2,
    iy_mm4: record.properties.iy_mm4,
    wpl_y_mm3: record.properties.wpl_y_mm3,
  };
}

// De twee profielbronnen tegen elkaar. Zie punt 2 in de kop.
for (const beam of project.beams) {
  const solver = doorsneden[String(beam.id)];
  const catalogus = gebruikteProfielen[beam.profile];
  if (solver.A_mm2 !== catalogus.area_mm2 || solver.I_mm4 !== catalogus.iy_mm4) {
    stop(
      `De twee profielbronnen zijn uiteengelopen voor "${beam.profile}":\n` +
        `    solver  (src/lib/steelSections.generated.ts) : A = ${solver.A_mm2}, I = ${solver.I_mm4}\n` +
        `    toetsing (steel-profiles/data/profiles.json)  : A = ${catalogus.area_mm2}, I = ${catalogus.iy_mm4}\n` +
        "  Dezelfde staaf zou dan met de ene doorsnede berekend en met de andere getoetst\n" +
        "  worden. Genereer de tabel opnieuw: node scripts/genereer-staalprofielen.mjs",
    );
  }
}

/** Vingerafdruk over precies de gebruikte profielrecords. */
const profielenHash = createHash("sha256")
  .update(JSON.stringify(gebruikteProfielen))
  .digest("hex");

// ── 2. Analytische invarianten, mechanisch uit het model afgeleid ──────────
// Deze getallen komen NIET uit het solverantwoord. Ze volgen uit q, L en de
// combinatiefactoren in het projectbestand, en gelden ongeacht A en I. Daarmee
// is een profieldrift (waarden schuiven, invarianten houden stand) te
// onderscheiden van een rekenfout (invariant breekt).

const knoop = new Map(project.nodes.map((n) => [n.id, n]));
const staaf = new Map(project.beams.map((b) => [b.id, b]));

function lengteM(beamId) {
  const b = staaf.get(beamId);
  const a = knoop.get(b.from);
  const c = knoop.get(b.to);
  return Math.hypot(c.x - a.x, c.z - a.z) / 1000;
}

const lijnlasten = project.loads.filter((l) => l.type === "lineLoad");
if (lijnlasten.length !== project.loads.length) {
  stop(
    "Het gouden model bevat een lasttype dat de invariantenafleiding hieronder niet " +
      "kent. Breid de afleiding uit of houd het model bij lijnlasten.",
  );
}
for (const l of lijnlasten) {
  for (const veld of ["qStart", "qEnd", "startFrac", "endFrac", "qDir", "qCoord"]) {
    if (l[veld] !== undefined) {
      stop(
        `Last ${l.id} gebruikt \`${veld}\`. De afleiding hieronder gaat uit van een ` +
          "gelijkmatige lijnlast over de volle staaflengte in globale z-richting.",
      );
    }
  }
}

// De voorwaarden waaronder ½·q·L per oplegging geldt: een horizontale ligger
// tussen twee gelijke, even lange kolommen. Mechanisch getoetst, niet aangenomen.
const belasteStaven = [...new Set(lijnlasten.map((l) => l.beamId))];
if (belasteStaven.length !== 1) {
  stop("De afleiding gaat uit van precies één belaste staaf (de ligger).");
}
const liggerId = belasteStaven[0];
const ligger = staaf.get(liggerId);
if (knoop.get(ligger.from).z !== knoop.get(ligger.to).z) {
  stop("De belaste staaf is niet horizontaal; ½·q·L per oplegging geldt dan niet.");
}
const kolommen = project.beams.filter((b) => b.id !== liggerId);
if (
  kolommen.length !== 2 ||
  kolommen[0].profile !== kolommen[1].profile ||
  kolommen[0].material !== kolommen[1].material ||
  Math.abs(lengteM(kolommen[0].id) - lengteM(kolommen[1].id)) > 1e-9
) {
  stop(
    "De twee kolommen zijn niet gelijk (profiel, materiaal of lengte). De symmetrie " +
      "waarop R1 = R4 = ½·q·L berust, geldt dan niet.",
  );
}

const L = lengteM(liggerId);
/** Neerwaartse lijnlast per belastinggeval, in kN/m (positief = omlaag). */
const qPerGeval = new Map(
  lijnlasten.map((l) => [l.caseId, -l.q]),
);
const combinatie = project.combinations[0];
const qCombi = [...qPerGeval].reduce(
  (som, [caseId, q]) => som + (combinatie.factors[String(caseId)] ?? 0) * q,
  0,
);

/**
 * Eén invariant. `termen` wordt door beide lezers op dezelfde manier
 * uitgerekend: som van factor × operator(waarde op `pad`).
 * Operatoren: "waarde", "abs", "max_abs", "min".
 */
const invariant = (naam, termen, verwacht, tolerantie, eenheid, afleiding) => ({
  naam,
  termen,
  verwacht,
  tolerantie,
  eenheid,
  afleiding,
});

const w = (pad, factor = 1) => ({ pad, operator: "waarde", factor });
const maxAbs = (pad, factor = 1) => ({ pad, operator: "max_abs", factor });

const invarianten = [];
for (const [caseId, q] of qPerGeval) {
  const naamGeval = project.loadCases.find((c) => c.id === caseId)?.name ?? String(caseId);
  invarianten.push(
    invariant(
      `LG${caseId} "${naamGeval}" — oplegreactie knoop 1`,
      [w(["per_case", String(caseId), "reactions", "1", "fz"])],
      0.5 * q * L,
      1e-4,
      "kN",
      `0,5 · q · L = 0,5 · ${q} kN/m · ${L} m`,
    ),
    invariant(
      `LG${caseId} "${naamGeval}" — som verticale oplegreacties`,
      [
        w(["per_case", String(caseId), "reactions", "1", "fz"]),
        w(["per_case", String(caseId), "reactions", "4", "fz"]),
      ],
      q * L,
      1e-4,
      "kN",
      `q · L = ${q} kN/m · ${L} m (verticaal evenwicht)`,
    ),
    invariant(
      `LG${caseId} "${naamGeval}" — som horizontale oplegreacties`,
      [
        w(["per_case", String(caseId), "reactions", "1", "fx"]),
        w(["per_case", String(caseId), "reactions", "4", "fx"]),
      ],
      0,
      1e-6,
      "kN",
      "horizontaal evenwicht: er grijpt geen horizontale last aan",
    ),
    invariant(
      `LG${caseId} "${naamGeval}" — M_veld + |M_steun| in de ligger`,
      [
        maxAbs(["per_case", String(caseId), "elements", String(liggerId), "M_x"]),
        { pad: ["per_case", String(caseId), "elements", String(liggerId), "M_start"], operator: "abs", factor: 1 },
      ],
      (q * L * L) / 8,
      1e-3,
      "kNm",
      `q · L² / 8 = ${q} · ${L}² / 8 — geldt voor elke inklemmingsgraad`,
    ),
  );
}

invarianten.push(
  invariant(
    `Combinatie ${combinatie.id} "${combinatie.name}" — som verticale oplegreacties`,
    [
      w(["combinations", String(combinatie.id), "reactions", "1", "fz"]),
      w(["combinations", String(combinatie.id), "reactions", "4", "fz"]),
    ],
    qCombi * L,
    1e-4,
    "kN",
    `(${[...qPerGeval]
      .map(([id, q]) => `${combinatie.factors[String(id)]}·${q}`)
      .join(" + ")}) · ${L} m`,
  ),
  invariant(
    `Combinatie ${combinatie.id} "${combinatie.name}" — superpositie van de belastinggevallen`,
    [
      maxAbs(["combinations", String(combinatie.id), "elements", String(liggerId), "M_x"]),
      ...[...qPerGeval.keys()].map((caseId) =>
        maxAbs(
          ["per_case", String(caseId), "elements", String(liggerId), "M_x"],
          -(combinatie.factors[String(caseId)] ?? 0),
        ),
      ),
    ],
    0,
    1e-9,
    "kNm",
    "een lineaire combinatie is exact de gewogen som van de gevallen",
  ),
);

// ── 3. De solve zelf ───────────────────────────────────────────────────────

const antwoorden = await roepBundelAan([
  { v: 1, id: 1, op: "handshake", payload: {} },
  {
    v: 1,
    id: 2,
    op: "solve",
    payload: {
      project: { inhoud: projectTekst },
      detail: DETAIL,
      profiles: profielCatalogus,
    },
  },
]);

const handshake = antwoorden.find((a) => a.id === 1);
const solve = antwoorden.find((a) => a.id === 2);
if (!handshake?.ok) stop(`De handshake mislukte: ${JSON.stringify(handshake?.error)}`);
if (!solve?.ok) {
  stop(
    `De solve mislukte: [${solve?.error?.code}] ${solve?.error?.melding}\n  ` +
      JSON.stringify(solve?.error?.detail ?? {}),
  );
}

const r = solve.result;

// Velden die per bouw of per run verschillen horen niet in een gouden bestand:
// `solve_ms` is een klok, `bundle_hash` en `solver_version` veranderen bij elke
// herbouw van de bundel — ook als er geen getal verschuift. De bundelidentiteit
// wordt al bewaakt door `build.rs` en de handshake, niet hier.
const { solve_ms, bundle_hash, solver_version, ...waarden } = r;
void solve_ms;
void bundle_hash;
void solver_version;

if (waarden.warnings.length > 0) {
  stop(
    "De solve leverde waarschuwingen op; een gouden bestand hoort van een schone " +
      `berekening te komen:\n    ${waarden.warnings.join("\n    ")}`,
  );
}
if (waarden.skipped_beams.length > 0) {
  stop(
    "Er zijn staven overgeslagen bij de toetsinvoer; dat hoort in dit model niet:\n    " +
      JSON.stringify(waarden.skipped_beams),
  );
}

// ── 4. Het gouden bestand samenstellen ─────────────────────────────────────

const nieuw = {
  _leesmij:
    "GEGENEREERD BESTAND — niet met de hand bijwerken. Schrijf dit opnieuw met " +
    "`node design-mockup/scripts/genereer-golden.mjs` en beoordeel de diff. Een met " +
    "de hand aangepaste verwachting verankert een wijziging in de profieldata als " +
    "bug of verbergt hem; het blok `herkomst` bestaat om zo'n wijziging als eigen " +
    "regel in de diff te laten zien.",
  gegenereerd_door: "design-mockup/scripts/genereer-golden.mjs",
  model: "portaal.ifcfem2d",
  verzoek: {
    op: "solve",
    detail: DETAIL,
    combinaties: "uit het projectbestand",
    profielen: "src-tauri/crates/steel-profiles/data/profiles.json",
  },
  herkomst: {
    _leesmij:
      "Waarmee is er gerekend. `doorsneden` komt uit resolveSection in de bundel " +
      "(voedt de SOLVE via src/lib/steelSections.generated.ts); `profielen` komt uit " +
      "de catalogus van de Rust-crate (voedt de TOETSINVOER). Het generatiescript " +
      "weigert te schrijven als die twee voor hetzelfde profiel uiteenlopen.",
    doorsneden,
    profielen: gebruikteProfielen,
    profielen_sha256: profielenHash,
  },
  invarianten: {
    _leesmij:
      "Analytisch afgeleid uit het model (q, L, combinatiefactoren) — NIET uit het " +
      "solverantwoord, en onafhankelijk van A en I. Blijven deze staan terwijl " +
      "`waarden` schuift, dan is er profieldata gewijzigd. Breekt er een, dan is er " +
      "iets mis met de berekening zelf. Een term is factor × operator(waarde op pad); " +
      "de operatoren zijn waarde, abs, max_abs en min, en de som van de termen hoort " +
      "binnen `tolerantie` van `verwacht` te liggen.",
    controles: invarianten,
  },
  waarden,
};

// ── 5. Schrijven, of vergelijken en de drift melden ────────────────────────

/**
 * JSON met inspringing, maar alles wat compact op één regel past ook op één
 * regel. Zonder deze afweging wordt een stationsarray 21 regels lang en telt het
 * bestand duizenden regels — onleesbaar in een diff, en dan wordt drift juist
 * weer onzichtbaar.
 */
function schrijfJson(waarde, inspring = "", breedte = 100) {
  const compact = JSON.stringify(waarde);
  if (compact === undefined) return "null";
  if (compact.length + inspring.length <= breedte || waarde === null || typeof waarde !== "object") {
    return compact;
  }
  const binnen = inspring + "  ";
  if (Array.isArray(waarde)) {
    const items = waarde.map((v) => binnen + schrijfJson(v, binnen, breedte));
    return `[\n${items.join(",\n")}\n${inspring}]`;
  }
  const items = Object.entries(waarde).map(
    ([k, v]) => `${binnen}${JSON.stringify(k)}: ${schrijfJson(v, binnen, breedte)}`,
  );
  return `{\n${items.join(",\n")}\n${inspring}}`;
}

const nieuweTekst = schrijfJson(nieuw) + "\n";

/** Alle bladwaarden als pad → waarde, voor een leesbaar driftrapport. */
function bladeren(waarde, pad = "", uit = new Map()) {
  if (waarde !== null && typeof waarde === "object") {
    for (const [k, v] of Object.entries(waarde)) bladeren(v, pad ? `${pad}.${k}` : k, uit);
  } else {
    uit.set(pad, waarde);
  }
  return uit;
}

const oudeTekst = existsSync(GOLDEN) ? readFileSync(GOLDEN, "utf8") : null;
const gelijk = oudeTekst === nieuweTekst;

if (oudeTekst === null) {
  console.log("Er was nog geen gouden bestand; dit is de eerste generatie.");
} else if (gelijk) {
  console.log("Het gouden bestand is ongewijzigd — byte-identiek aan wat er stond.");
} else {
  const oud = bladeren(JSON.parse(oudeTekst));
  const nu = bladeren(nieuw);
  const paden = [...new Set([...oud.keys(), ...nu.keys()])].sort();
  const verschillen = paden.filter((p) => !Object.is(oud.get(p), nu.get(p)));

  const herkomst = verschillen.filter((p) => p.startsWith("herkomst."));
  const invariant = verschillen.filter((p) => p.startsWith("invarianten."));
  const rest = verschillen.filter(
    (p) => !p.startsWith("herkomst.") && !p.startsWith("invarianten."),
  );

  console.log("");
  console.log("HET GOUDEN BESTAND VERANDERT.");
  console.log(`  ${verschillen.length} veld(en) wijken af van het bestand op schijf.`);
  const toon = (titel, lijst, maximaal) => {
    if (lijst.length === 0) return;
    console.log("");
    console.log(`  ${titel} (${lijst.length}):`);
    for (const p of lijst.slice(0, maximaal)) {
      console.log(`    ${p}\n      was : ${JSON.stringify(oud.get(p))}\n      is  : ${JSON.stringify(nu.get(p))}`);
    }
    if (lijst.length > maximaal) {
      console.log(`    … en nog ${lijst.length - maximaal} veld(en); zie de diff.`);
    }
  };
  toon("HERKOMST — de doorsnede- of profieldata is gewijzigd", herkomst, 40);
  toon("INVARIANTEN — de analytische verwachting is gewijzigd", invariant, 20);
  toon("WAARDEN — de uitkomsten zijn gewijzigd", rest, 20);
  console.log("");
  if (herkomst.length > 0) {
    console.log(
      "  LET OP: de herkomst is gewijzigd. Alle verschoven waarden hieronder zijn\n" +
        "  daarmee verklaard zolang de invarianten staan. Beoordeel eerst of de nieuwe\n" +
        "  doorsnedegegevens kloppen — pas daarna is deze diff een verbetering en geen\n" +
        "  vastgelegde regressie.",
    );
    console.log("");
  }
}

if (alleenControleren) {
  if (gelijk) {
    console.log("--controleer: geen verschil.");
    process.exit(0);
  }
  console.error(
    "--controleer: het gouden bestand op schijf loopt niet gelijk met wat de bundel " +
      "nu oplevert.\n  Draai `node scripts/genereer-golden.mjs` en beoordeel de diff.",
  );
  process.exit(1);
}

writeFileSync(GOLDEN, nieuweTekst);
console.log(`Geschreven: ${GOLDEN} (${nieuweTekst.length} bytes)`);
console.log(`  invarianten : ${invarianten.length}`);
console.log(`  profielen   : ${Object.keys(gebruikteProfielen).join(", ")} (sha256 ${profielenHash.slice(0, 16)}…)`);
