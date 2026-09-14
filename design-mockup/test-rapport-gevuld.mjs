// Het rekenrapport ECHT gevuld: elke betonstaaf haar dekkingslijn, en de
// scheefstand bij de uitgangspunten.
//
// ── WAAROM DEZE TEST BESTAAT ───────────────────────────────────────────────
//
// Twee hoofdstukken van de PDF-uitdraai waren gebouwd maar werden niet gevoed.
// Dat is erger dan een ontbrekend hoofdstuk, want het ziet er af uit:
//
//  * `concrete_dekkingslijnen` is een LIJST, maar er kwam er één in: die van de
//    staaf die het betonvenster het laatst had opgevraagd. Een rapport over
//    vier betonstaven droeg figuur 9.2 van één staaf, zonder dat ergens stond
//    dat de andere drie ontbraken.
//  * `scheefstand_toelichting` had een veld, een bouwer en een hoofdstuk, maar
//    de app gaf de tekst alleen aan de balk onder het canvas als tooltip.
//
// Een test die alleen controleert DAT die twee velden bestaan, zegt niets —
// `test-rapportpdf-invoer` doet dat al. Deze test loopt daarom de HELE keten:
// van het model via de echte rekenkern naar een PDF die werkelijk gezet wordt,
// en telt daarin de bladzijden en de hoofdstukken.
//
//   [1] HET MODEL        — twee betonstaven, één horizontaal steunpunt.
//   [2] DE SCHEEFSTAND   — `lib/scheefstandNorm` levert de tekst die App.tsx
//                          aan het rapport doorgeeft.
//   [3] DE TOETSING      — `check_concrete_beams` via de toetsbrug.
//   [4] DE LIJNEN        — `haalAlleDekkingslijnen`: ÉÉN PER BETONSTAAF, niet
//                          één voor het hele model.
//   [5] DE TEGENPROEF    — met een LIJNLAST krijgen dezelfde staven wél een
//                          normaalkracht, en dan weigert de kern beide lijnen
//                          met 6.2.3(1). Ze komen dan in `mislukt` terecht en
//                          worden dus gemeld in plaats van stil weggelaten.
//   [6] DE RAPPORTINVOER — beide lijnen én de scheefstandtekst in één
//                          `ReportInput`.
//   [7] DE PDF           — de rekenkern zet hem echt. De proef is een
//                          VERGELIJKING: dezelfde invoer zonder de lijnen en
//                          zonder de scheefstand levert aantoonbaar minder
//                          bladzijden op. Een PDF die alleen met `%PDF` begint
//                          bewijst niets.
//
// Blok [3], [4] en [5] worden LUID overgeslagen als de toetsbrug-binary
// ontbreekt, blok [7] als de MCP-serverbinary ontbreekt. [1], [2] en [6]
// draaien altijd.
//
// Uitvoeren: npx tsx test-rapport-gevuld.mjs   (vanuit design-mockup/)
//        of: node scripts/run-tests.mjs --filter=rapport-gevuld

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const BIN = join(resolve(HIER, ".."), "src-tauri", "target", "release");
const WIN = process.platform === "win32";
const TOETSBRUG = join(BIN, WIN ? "toetsbrug.exe" : "toetsbrug");
const MCP_SERVER = join(BIN, WIN ? "openaec-mcp-server.exe" : "openaec-mcp-server");

const { solveAllCases } = await import("./src/components/fem/solver/engine.ts");
const { combineResults } = await import("./src/components/fem/solver/combinations.ts");
const { bouwMultiInput } = await import("./src/lib/modelNaarSolverInput.ts");
const { buildBetonCheckInputs } = await import("./src/lib/betonCheckBuilder.ts");
const { korvenUitStaven } = await import("./src/stores/checkStore.ts");
const { haalAlleDekkingslijnen } = await import("./src/lib/betonDekkingslijnBuilder.ts");
const { bouwRapportInvoer } = await import("./src/lib/rapportPdfInvoer.ts");
const {
  bepaalScheefstand,
  leidScheefstandGeometrieAf,
  scheefstandToelichting,
  toepasselijkeScheefstandNormen,
} = await import("./src/lib/scheefstandNorm.ts");

let passed = 0, failed = 0, overgeslagen = 0;
const log = (s) => process.stdout.write(s + "\n");

function ok(naam, voorwaarde, extra = "") {
  if (voorwaarde) { passed++; log(`  ✓ ${naam}${extra ? ` — ${extra}` : ""}`); }
  else            { failed++; log(`  ✗ ${naam}${extra ? ` — ${extra}` : ""}`); }
}

// ═══════════════════════════════════════════════════════════════════════════
// HET MODEL
// ═══════════════════════════════════════════════════════════════════════════
//
// Een vrij opgelegde betonligger van 10,5 m met een puntlast op 6 m. Die
// lastknoop deelt de ligger in TWEE betonstaven — precies zoals de app dat
// doet — met elk een eigen doorsnede en een eigen staffeling. Twee staven is
// het minimum waarmee "één lijn per staaf" te onderscheiden is van "de laatst
// opgevraagde lijn".
//
// ── WAAROM DE LAST OP EEN KNOOP STAAT EN NIET ALS LIJNLAST ─────────────────
//
// De scheefstand zet op elke VERTICALE lastcomponent een horizontale metgezel
// H = φ·V. Bij een lijnlast is dat een verdeelde axiale last óp de staaf, en
// dan draagt de staaf een normaalkracht — hoe klein ook. De dekkingslijn
// weigert dat zonder opgegeven z: 6.2.3(1) staat z = 0,9·d uitsluitend toe
// "in de dwarskrachtberekening van gewapend beton zonder normaalkracht".
// Blok [5] bewijst dat met dezelfde staven.
//
// Bij een KNOOPlast valt de metgezel op de knoop zelf. Staat die knoop
// horizontaal vast — knoop 2 heeft hier een xRoller, het stabiliteitspunt van
// de vloer — dan gaat H rechtstreeks de oplegging in en houden de liggers
// N = 0. Dat is geen kunstgreep maar waar de scheefstand voor bedoeld is: zij
// belast het stabiliteitssysteem. Om diezelfde reden staat het eigen gewicht
// hier uit; dat is een lijnlast en zou N weer terugbrengen.
const KORF_600 = {
  cover_mm: 30,
  stirrup_diameter_mm: 8,
  bottom: { count: 3, diameter_mm: 16 },
  top: { count: 2, diameter_mm: 12 },
  stirrup_spacing_mm: 200,
  stirrup_legs: 2,
};
const KORF_500 = { ...KORF_600, bottom: { count: 3, diameter_mm: 16 } };

const langs = (side, count, diameter, x0, x1) => ({
  side, row: { count, diameter_mm: diameter }, x_start_mm: x0, x_end_mm: x1,
});
const beugels = (x0, x1, spacing) => ({
  x_start_mm: x0, x_end_mm: x1, spacing_mm: spacing, legs: 2, diameter_mm: 8,
});

// Staaf 1 (6,0 m): het moment loopt op naar de lastknoop, dus de bijlegwapening
// ligt aan díe kant. Staaf 2 (4,5 m): spiegelbeeld.
const ZONES_1 = {
  longitudinal: [
    langs("Bottom", 3, 16, 0, 2000),
    langs("Bottom", 5, 16, 2000, 6000),
    langs("Top", 2, 12, 0, 6000),
  ],
  stirrups: [beugels(0, 1000, 100), beugels(1000, 5000, 200), beugels(5000, 6000, 100)],
};
const ZONES_2 = {
  longitudinal: [
    langs("Bottom", 5, 16, 0, 2500),
    langs("Bottom", 3, 16, 2500, 4500),
    langs("Top", 2, 12, 0, 4500),
  ],
  stirrups: [beugels(0, 900, 100), beugels(900, 3600, 200), beugels(3600, 4500, 100)],
};

const cfg = (korf, zones) => ({
  betonKorf: korf,
  betonStaalsoort: "B500B",
  betonMilieuklasse: "XC1",
  betonZones: zones,
});

// ── De scheefstand, vóór het model ─────────────────────────────────────────
//
// Dezelfde volgorde als App.tsx: eerst φ bepalen, dan met DIE noemer rekenen.
// De hoogte h en het aantal dragende verticale elementen m staan hier
// handmatig — het model is een vloerligger en heeft geen kolommen, en de norm
// laat h en m uitdrukkelijk aan de constructeur (de app leidt ze af als HULP).
const SCHEEFSTAND_KEUZE = { bron: "en1992", noemer: 200, hoogteM: 9, aantalElementen: 2 };
const SCHEEFSTAND_GEOMETRIE = leidScheefstandGeometrieAf({
  nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 10500, z: 0 }],
  beams: [{ id: 1, from: 1, to: 2 }, { id: 2, from: 2, to: 3 }],
  supports: [{ nodeId: 1 }, { nodeId: 2 }, { nodeId: 3 }],
});
const SCHEEFSTAND_UITKOMST = bepaalScheefstand(
  SCHEEFSTAND_KEUZE,
  SCHEEFSTAND_GEOMETRIE,
  toepasselijkeScheefstandNormen([
    { id: 1, material: "C30/37", profile: "300x600" },
    { id: 2, material: "C30/37", profile: "300x500" },
  ]),
);
const SCHEEFSTAND_NOEMER = SCHEEFSTAND_UITKOMST.noemer;
const SCHEEFSTAND_TEKST = scheefstandToelichting(SCHEEFSTAND_UITKOMST, SCHEEFSTAND_GEOMETRIE);

/**
 * @param {"knooplast"|"lijnlast"} lastsoort  Zie de toelichting hierboven: de
 *   lijnlastvariant is de tegenproef van blok [5].
 */
function bouwModel(lastsoort) {
  const knooplast = lastsoort === "knooplast";
  return {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: 6000, z: 0 }, { id: 3, x: 10500, z: 0 }],
    beams: [
      { id: 1, from: 1, to: 2, material: "C30/37", profile: "300x600",
        checkConfig: cfg(KORF_600, ZONES_1) },
      { id: 2, from: 2, to: 3, material: "C30/37", profile: "300x500",
        checkConfig: cfg(KORF_500, ZONES_2) },
    ],
    supports: [
      { nodeId: 1, type: "zRoller" },
      // Het stabiliteitspunt: houdt de vloer horizontaal op zijn plaats en
      // neemt daarmee de vervangende horizontale kracht van de scheefstand op.
      { nodeId: 2, type: "xRoller" },
      { nodeId: 3, type: "zRoller" },
    ],
    plates: [],
    loadCases: [
      { id: 1, name: "Blijvend", type: "dead" },
      { id: 2, name: "Veranderlijk", type: "live" },
    ],
    loads: knooplast
      ? [
          { id: 1, type: "pointForce", caseId: 1, nodeId: 2, fz: -20 },
          { id: 2, type: "pointForce", caseId: 2, nodeId: 2, fz: -12 },
        ]
      : [
          { id: 1, type: "lineLoad", caseId: 1, beamId: 1, q: -4 },
          { id: 2, type: "lineLoad", caseId: 1, beamId: 2, q: -4 },
        ],
    selfWeightEnabled: false,
    scheefstandEnabled: true,
    scheefstandNoemer: SCHEEFSTAND_NOEMER,
    scheefstandRichting: 1,
  };
}

const COMBOS = [
  { id: 1, name: "UGT 6.10b", type: "uls", formula: "1,20·G + 1,50·Q",
    factors: new Map([[1, 1.2], [2, 1.5]]) },
  { id: 2, name: "BGT frequent", type: "sls", formula: "G + 0,50·Q",
    factors: new Map([[1, 1.0], [2, 0.5]]) },
  { id: 3, name: "BGT quasi-blijvend", type: "sls", formula: "G + 0,30·Q",
    factors: new Map([[1, 1.0], [2, 0.3]]) },
];

/** De hele app-route van model naar resultaten per combinatie. */
function rekenDoor(model) {
  const multi = bouwMultiInput(model);
  const perCase = solveAllCases(multi).perCase;
  return new Map(COMBOS.map((c) => [c.id, combineResults(c, perCase)]));
}

log("═".repeat(78));
log("HET REKENRAPPORT GEVULD — dekkingslijn per staaf, scheefstand bij de uitgangspunten");
log("═".repeat(78));

// ═══════════════════════════════════════════════════════════════════════════
log("\n[2] De scheefstand die de berekening in gaat");
// ═══════════════════════════════════════════════════════════════════════════
log(`      φ = 1/${SCHEEFSTAND_NOEMER.toFixed(0)} volgens ${SCHEEFSTAND_UITKOMST.bron}`);
ok("de norm levert een kleinere scheefstand dan de kale basiswaarde 1/200",
  SCHEEFSTAND_NOEMER > 200, `1/${SCHEEFSTAND_NOEMER.toFixed(0)}`);
ok("de toelichting noemt het normartikel", /5\.1/.test(SCHEEFSTAND_TEKST));
ok("de toelichting noemt α_h en α_m met hun waarde",
  /alpha_h|α_h/.test(SCHEEFSTAND_TEKST) && /alpha_m|α_m/.test(SCHEEFSTAND_TEKST));
ok("de toelichting zegt dat h en m handmatig zijn opgegeven",
  /handmatig/.test(SCHEEFSTAND_TEKST));

// ═══════════════════════════════════════════════════════════════════════════
log("\n[1] Het model — twee betonstaven, scheefstand aan");
// ═══════════════════════════════════════════════════════════════════════════
const model = bouwModel("knooplast");
const resultaten = rekenDoor(model);
const korven = korvenUitStaven(model.beams);
const bouwData = {
  nodes: model.nodes,
  beams: model.beams,
  combinations: COMBOS,
  combinationResults: resultaten,
  korven,
};
const betonInvoer = buildBetonCheckInputs(bouwData);

ok("beide staven zijn als betonstaaf herkend",
  betonInvoer.inputs.length === 2 && betonInvoer.skipped.length === 0,
  `${betonInvoer.inputs.length} invoeren, ${betonInvoer.skipped.length} overgeslagen`);
for (const b of betonInvoer.inputs) {
  const nMax = b.forces_envelope.reduce((m, p) => Math.max(m, Math.abs(p.forces.n_ed)), 0);
  const mMax = b.forces_envelope.reduce((m, p) => Math.max(m, Math.abs(p.forces.my_ed)), 0);
  ok(`staaf ${b.beam_id} draagt moment maar geen normaalkracht`,
    mMax > 1 && nMax === 0, `max|M_Ed| = ${mMax.toFixed(1)} kNm, max|N_Ed| = ${nMax} kN`);
}

// ═══════════════════════════════════════════════════════════════════════════
// De echte rekenkern, als apart proces (dezelfde weg die de dev-brug neemt)
// ═══════════════════════════════════════════════════════════════════════════
const echteKern = (opdracht, inputs) => new Promise((res, rej) => {
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

let toetsResultaten = [];
let lijnen = [];

if (!existsSync(TOETSBRUG)) {
  overgeslagen++;
  log("\n[3]-[5] overgeslagen: de toetsbrug ontbreekt");
  log(`        (${TOETSBRUG} — bouw hem met: cargo build --release -p toetsbrug)`);
} else {
  // ═════════════════════════════════════════════════════════════════════════
  log("\n[3] De toetsing van beide staven — check_concrete_beams");
  // ═════════════════════════════════════════════════════════════════════════
  toetsResultaten = await echteKern("check_concrete_beams", betonInvoer.inputs);
  ok("de kern toetst beide staven", toetsResultaten.length === 2);
  for (const r of toetsResultaten) {
    log(`      staaf ${r.beam_id}: ${r.section_name} ${r.concrete_class}, UC_max = ${r.uc_max?.toFixed?.(2) ?? "—"}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  log("\n[4] De dekkingslijnen — één per betonstaaf");
  // ═════════════════════════════════════════════════════════════════════════
  const alle = await haalAlleDekkingslijnen(bouwData, echteKern);
  lijnen = alle.lijnen;
  ok("er komt een lijn per BETONSTAAF en niet één voor het hele model",
    alle.lijnen.length === 2, `${alle.lijnen.length} lijnen, ${alle.mislukt.length} zonder lijn`);
  ok("de lijnen dragen hun eigen staafnummer, oplopend",
    alle.lijnen.length === 2 && alle.lijnen[0].beam_id === 1 && alle.lijnen[1].beam_id === 2,
    alle.lijnen.map((l) => `staaf ${l.beam_id}`).join(", "));
  ok("elke lijn gaat over de EIGEN doorsnede en lengte",
    alle.lijnen.length === 2 &&
      alle.lijnen[0].section_name !== alle.lijnen[1].section_name &&
      Math.abs(alle.lijnen[0].lengte_mm - 6000) < 1 &&
      Math.abs(alle.lijnen[1].lengte_mm - 4500) < 1,
    alle.lijnen.map((l) => `${l.section_name} over ${l.lengte_mm} mm`).join(" | "));
  for (const l of alle.lijnen) {
    ok(`staaf ${l.beam_id}: figuur 9.2 is werkelijk uitgerekend`,
      l.onder.punten.length > 0 && l.onder.bundels.length >= 2 && l.a_l_mm > 0,
      `${l.onder.punten.length} punten, ${l.onder.bundels.length} bundels, a_l = ${l.a_l_mm.toFixed(0)} mm`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  log("\n[5] Tegenproef — met een lijnlast geeft de scheefstand wél normaalkracht");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Dit legt de koppeling vast die anders pas in de praktijk opvalt: zodra de
  // scheefstand op een VERDEELDE last werkt, draagt de staaf een normaalkracht
  // en weigert de kern de dekkingslijn (6.2.3(1)). De staven horen dan in
  // `mislukt` te staan met die reden — niet stil te verdwijnen.
  {
    const lijnlastModel = bouwModel("lijnlast");
    const lijnlastData = {
      nodes: lijnlastModel.nodes,
      beams: lijnlastModel.beams,
      combinations: COMBOS,
      combinationResults: rekenDoor(lijnlastModel),
      korven: korvenUitStaven(lijnlastModel.beams),
    };
    const uit = await haalAlleDekkingslijnen(lijnlastData, echteKern);
    ok("geen enkele lijn, en beide staven staan met reden in `mislukt`",
      uit.lijnen.length === 0 && uit.mislukt.length === 2,
      `${uit.lijnen.length} lijnen, ${uit.mislukt.length} gemeld`);
    ok("de reden noemt het normartikel en de normaalkracht",
      uit.mislukt.every((m) => /6\.2\.3\(1\)/.test(m.reason) && /normaalkracht/.test(m.reason)),
      uit.mislukt[0]?.reason?.slice(0, 90) ?? "");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[6] De rapportinvoer draagt beide lijnen én de scheefstand");
// ═══════════════════════════════════════════════════════════════════════════
const PROJECT = {
  name: "Vloerligger met stabiliteitspunt",
  projectNumber: "RG-001",
  engineer: "Testloop",
  company: "OpenAEC Foundation",
  date: "2026-09-14",
};

function bouwInvoer({ metLijnen = true, metScheefstand = true } = {}) {
  return bouwRapportInvoer({
    project: PROJECT,
    checkResults: toetsResultaten,
    korvenUitModel: new Map([...korven].map(([id, c]) => [id, c.korf])),
    dekkingslijnen: metLijnen && lijnen.length > 0 ? lijnen : undefined,
    betonInvoer: betonInvoer.inputs,
    scheefstandToelichting: metScheefstand ? SCHEEFSTAND_TEKST : "",
  });
}

const invoer = bouwInvoer();
ok("de scheefstandtekst gaat WOORDELIJK mee",
  invoer.scheefstand_toelichting === SCHEEFSTAND_TEKST);
ok("de wapeningszones van beide staven gaan mee",
  (invoer.concrete_reinforcement_zones ?? []).length === 2);
if (lijnen.length > 0) {
  ok("beide dekkingslijnen staan in de invoer",
    (invoer.concrete_dekkingslijnen ?? []).length === 2,
    `${(invoer.concrete_dekkingslijnen ?? []).length} lijnen`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n[7] De PDF — door de rekenkern gezet, en de hoofdstukken erin geteld");
// ═══════════════════════════════════════════════════════════════════════════
if (!existsSync(MCP_SERVER)) {
  overgeslagen++;
  log(`  (overgeslagen: ${MCP_SERVER} ontbreekt — bouw hem met`);
  log("   cargo build --release -p openaec-mcp-server  vanuit src-tauri)");
} else if (toetsResultaten.length === 0) {
  overgeslagen++;
  log("  (overgeslagen: zonder toetsbrug zijn er geen toetsresultaten om te zetten)");
} else {
  /**
   * Eén `generate_steel_report_pdf` over de MCP-server: dezelfde
   * `report::generate_report_pdf` die achter het Tauri-command zit, maar als
   * apart proces te starten — net zoals de toetsbrug hierboven. Zo is de PDF
   * zonder desktop-app te maken en dus in een testloop na te rekenen.
   */
  const zetPdf = (rapportInvoer) => new Promise((res, rej) => {
    const kind = spawn(MCP_SERVER, [], { stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", fout = "";
    kind.stderr.on("data", (d) => (fout += d));
    kind.on("error", rej);
    kind.stdout.on("data", (d) => {
      buffer += d;
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const regel = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!regel) continue;
        let bericht;
        try { bericht = JSON.parse(regel); } catch { continue; }
        if (bericht.id !== 2) continue;
        kind.stdin.end();
        kind.kill();
        const inhoud = bericht.result?.structuredContent;
        if (bericht.error) return rej(new Error(bericht.error.message));
        if (bericht.result?.isError) return rej(new Error(JSON.stringify(inhoud)));
        if (!inhoud?.pdf_base64) return rej(new Error(`geen PDF terug: ${regel.slice(0, 200)}`));
        return res(Buffer.from(inhoud.pdf_base64, "base64"));
      }
    });
    kind.on("close", () => rej(new Error(`de MCP-server stopte zonder antwoord: ${fout.slice(-300)}`)));
    kind.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
    }) + "\n");
    kind.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "generate_steel_report_pdf", arguments: rapportInvoer },
    }) + "\n");
  });

  /** Het aantal bladzijden uit de paginaboom van de PDF. */
  const bladzijden = (pdf) => {
    const m = pdf.toString("latin1").match(/\/Count\s+(\d+)/);
    return m ? Number(m[1]) : 0;
  };

  const volledig = await zetPdf(invoer);
  const zonderLijnen = await zetPdf(bouwInvoer({ metLijnen: false }));
  const zonderScheefstand = await zetPdf(bouwInvoer({ metScheefstand: false }));

  const pad = join(tmpdir(), `openaec_rapport_gevuld_${process.pid}.pdf`);
  writeFileSync(pad, volledig);
  log(`      ${volledig.length} bytes, ${bladzijden(volledig)} bladzijden → ${pad}`);

  ok("de kern levert een echte PDF", volledig.subarray(0, 5).toString() === "%PDF-");
  ok("hij heeft bladzijden", bladzijden(volledig) > 0, `${bladzijden(volledig)}`);
  // De vergelijking is het bewijs: een veld dat doorgegeven wordt maar niets
  // tekent, levert een even grote PDF op.
  ok("de twee dekkingslijnen maken de PDF aantoonbaar langer",
    bladzijden(volledig) > bladzijden(zonderLijnen),
    `${bladzijden(volledig)} met, ${bladzijden(zonderLijnen)} zonder`);
  ok("de scheefstand maakt de PDF aantoonbaar langer",
    volledig.length > zonderScheefstand.length,
    `${volledig.length} met, ${zonderScheefstand.length} zonder`);

  // En de tweede lijn draagt evenveel bij als de eerste: met ALLEEN de lijn van
  // staaf 1 — de oude toestand, waarin het rapport de laatst opgevraagde lijn
  // kreeg — is de PDF korter dan met beide.
  const alleenEerste = await zetPdf(bouwRapportInvoer({
    project: PROJECT,
    checkResults: toetsResultaten,
    korvenUitModel: new Map([...korven].map(([id, c]) => [id, c.korf])),
    dekkingslijnen: lijnen.slice(0, 1),
    betonInvoer: betonInvoer.inputs,
    scheefstandToelichting: SCHEEFSTAND_TEKST,
  }));
  ok("met twee lijnen staat er méér op papier dan met alleen de eerste",
    bladzijden(volledig) > bladzijden(alleenEerste),
    `${bladzijden(volledig)} bladzijden met beide, ${bladzijden(alleenEerste)} met alleen staaf 1`);
}

// ═══════════════════════════════════════════════════════════════════════════
log("\n" + "═".repeat(78));
log(`${passed} geslaagd, ${failed} mislukt${overgeslagen > 0 ? `, ${overgeslagen} blok(ken) overgeslagen` : ""}`);
log("═".repeat(78));
process.exit(failed > 0 ? 1 : 0);
